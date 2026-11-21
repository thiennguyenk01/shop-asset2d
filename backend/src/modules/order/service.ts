import "server-only";
import { randomBytes } from "node:crypto";
import { databaseBlockedByFreeTier } from "@backend/modules/usage/guard";
import { Prisma } from "@backend/generated/prisma/client";
import type { Locale } from "@backend/i18n/routing";
import { extraDownloadsBlock, type ExtraDownloadsBlock } from "@backend/lib/download/rules";
import { pickTranslation } from "@backend/lib/format";
import { isMomoPayUrl } from "@backend/lib/payment/momo";
import type { AmountRange } from "@backend/lib/payment/limits";
import { effectiveOrderStatus, makeOrderCode, ORDER_TTL_MINUTES, type OrderStatus } from "@backend/lib/payment/rules";
import { sepayQrImageUrl } from "@backend/lib/payment/sepay";
import { getCartSummary, type CartSummary } from "@backend/modules/cart/service";
import { getEnv } from "@backend/env";
import { getActiveProvider, PaymentUnavailableError, type ProviderId } from "@backend/modules/payment/providers";
import { toMedia, type MediaData } from "@backend/modules/product/queries";
import { getExtraDownloadsOffer } from "@backend/modules/settings/service";
import { getProfile } from "@backend/modules/user/service";
import {
  findCheckoutSnapshots,
  findCouponId,
  findOrderForUser,
  findOrdersPage,
  findPackForExtraDownloads,
  insertOrder,
  insertPayment,
  markOrderFailed,
  type NewOrder,
} from "./repository";

/**
 * Orders (CLAUDE.md §6 steps 1–2): the server reads the cart, recomputes every price and the coupon from the
 * database, drops lines that are no longer payable (owned / unavailable), snapshots each line, creates the
 * order PENDING and starts a payment with the active provider. Nothing is granted here — only a verified
 * webhook does that (payment/service.ts).
 */
export type CheckoutView = {
  buyer: { name: string; email: string };
  summary: CartSummary;
  /** The active gateway, shown as the payment method. */
  method: ProviderId;
  /** No real money moves (Demo, or MoMo's test environment): the page says so. */
  testMode: boolean;
  /** The gateway cannot take this total (MoMo: 1.000 ₫ – 50.000.000 ₫); the page explains instead of offering to pay. */
  amountSupported: boolean;
  /** Totals the active gateway accepts (for that explanation). */
  amountRange: AmountRange;
};

export async function getCheckout(
  userId: string,
  locale: Locale,
  couponCode: string | null,
): Promise<CheckoutView | null> {
  const [profile, summary] = await Promise.all([
    getProfile(userId),
    getCartSummary({ kind: "user", userId }, locale, couponCode),
  ]);
  if (!profile) return null;
  const provider = getActiveProvider();
  return {
    buyer: { name: profile.name ?? profile.email, email: profile.email },
    summary,
    method: provider.id,
    testMode: provider.testMode,
    amountSupported: amountSupported(provider.amountRange, summary.totalVnd),
    amountRange: provider.amountRange,
  };
}

export type PlaceOrderBlock = "signInRequired" | "empty" | "priceChanged" | PaymentBlock;
/**
 * amountNotSupported: the gateway cannot take this total · paymentUnavailable: the gateway did not start the payment ·
 * shopPaused: "free plans only" is on and the database has reached the free allowance (no new orders).
 */
export type PaymentBlock = "amountNotSupported" | "paymentUnavailable" | "shopPaused";

const amountSupported = (range: { min: number; max: number }, totalVnd: number) => totalVnd >= range.min && totalVnd <= range.max;
export type PlaceOrderResult =
  { ok: true; orderCode: string; redirectTo: string } | { ok: false; reason: PlaceOrderBlock };

export async function placeOrder(input: {
  userId: string;
  locale: Locale;
  couponCode: string | null;
  /** The total the buyer saw on the checkout page — if today's total differs, they must look again. */
  expectedTotalVnd: number;
  /** This site's public origin for the gateway (lib/http/origin.ts); APP_URL when absent. */
  origin?: string;
  now?: Date;
}): Promise<PlaceOrderResult> {
  const now = input.now ?? new Date();
  if (await databaseBlockedByFreeTier()) return { ok: false, reason: "shopPaused" };
  const checkout = await getCheckout(input.userId, input.locale, input.couponCode);
  if (!checkout) return { ok: false, reason: "signInRequired" };
  const { summary, buyer } = checkout;
  const payable = summary.lines.filter((l) => l.state === "ok");
  if (payable.length === 0) return { ok: false, reason: "empty" };
  if (summary.totalVnd !== input.expectedTotalVnd) return { ok: false, reason: "priceChanged" };
  if (!checkout.amountSupported) return { ok: false, reason: "amountNotSupported" };

  const snapshots = new Map(
    (
      await findCheckoutSnapshots(
        input.userId,
        payable.map((l) => l.productId),
        input.locale,
      )
    ).map((s) => [s.productId, s]),
  );
  if (payable.some((l) => !snapshots.has(l.productId))) return { ok: false, reason: "priceChanged" }; // cart changed meanwhile

  const couponId = summary.coupon?.ok && summary.coupon.code ? await findCouponId(summary.coupon.code) : null;
  const provider = getActiveProvider();
  const order = {
    userId: input.userId,
    subtotalVnd: summary.totals.subtotalVnd,
    discountVnd: couponId ? summary.discountVnd : 0,
    totalVnd: summary.totals.subtotalVnd - (couponId ? summary.discountVnd : 0),
    couponId,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    locale: input.locale,
    isDemo: provider.testMode,
    expiresAt: new Date(now.getTime() + ORDER_TTL_MINUTES * 60_000),
    items: payable.map((l) => {
      const s = snapshots.get(l.productId)!;
      const lic = s.license;
      return {
        productId: l.productId,
        productType: s.product.type,
        titleSnapshot: l.title,
        priceSnapshotVnd: l.priceVnd,
        licenseId: lic.id,
        licenseSnapshot: {
          code: lic.code,
          name: pickTranslation(lic.translations, input.locale)?.name ?? lic.code,
          commercial: lic.allowCommercial,
          modification: lic.allowModification,
          multiProject: lic.allowMultiProject,
          redistribution: lic.allowRedistribution,
          resale: lic.allowResale,
        },
        versionId: s.product.currentVersionId,
      };
    }),
  };

  return createOrderWithPayment(order, now, input.origin);
}

/**
 * Insert the PENDING order under a fresh readable code, then start its payment with the active provider. When
 * the gateway does not start it, the order is marked FAILED (it never reached the gateway) and the buyer is told
 * to try again; the cart is untouched.
 */
async function createOrderWithPayment(
  order: Omit<NewOrder, "code">,
  now: Date,
  origin: string | undefined,
): Promise<{ ok: true; orderCode: string; redirectTo: string } | { ok: false; reason: "paymentUnavailable" }> {
  const provider = getActiveProvider();
  // A readable code; on the (very unlikely) collision, draw again.
  let created: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await insertOrder({ ...order, code: makeOrderCode(now, randomBytes(6)) });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!created) throw new Error("Không tạo được mã đơn hàng.");

  let payment;
  try {
    payment = await provider.createPayment({
      code: created.code,
      totalVnd: order.totalVnd,
      locale: order.locale,
      origin: origin ?? new URL(getEnv().APP_URL).origin,
    });
  } catch (e) {
    if (!(e instanceof PaymentUnavailableError)) throw e;
    console.warn(`[payment] ${e.message}`);
    await markOrderFailed(created.id);
    return { ok: false, reason: "paymentUnavailable" };
  }
  await insertPayment(created.id, provider.id, payment.providerTxnId, order.totalVnd, payment.resumeUrl);
  return { ok: true, orderCode: created.code, redirectTo: payment.redirectTo };
}

export type ExtraDownloadsOrderResult =
  { ok: true; orderCode: string; redirectTo: string } | { ok: false; reason: "signInRequired" | ExtraDownloadsBlock | PaymentBlock };

/**
 * "Buy more downloads" for one free pack (CLAUDE.md §5, step 4.6): no cart, no coupon — one order line of kind
 * EXTRA_DOWNLOADS. Count and price come from the shop settings (server, step 5.6), never from the client; the order
 * line keeps them, so a later change in Settings does not touch this order. Like any order,
 * nothing is granted here: the verified webhook adds the downloads (payment/service.ts).
 */
export async function placeExtraDownloadsOrder(input: {
  userId: string;
  productId: string;
  locale: Locale;
  origin?: string;
  now?: Date;
}): Promise<ExtraDownloadsOrderResult> {
  const now = input.now ?? new Date();
  const [profile, pack, offer] = await Promise.all([
    getProfile(input.userId),
    findPackForExtraDownloads(input.productId, input.locale),
    getExtraDownloadsOffer(),
  ]);
  if (!profile) return { ok: false, reason: "signInRequired" };
  const license = pack?.licenses[0]?.license ?? null;
  const block = extraDownloadsBlock(pack ? { status: pack.status, type: pack.type, hasTerms: !!license } : null);
  if (block) return { ok: false, reason: block };
  if (await databaseBlockedByFreeTier()) return { ok: false, reason: "shopPaused" };

  const price = offer.priceVnd;
  const provider = getActiveProvider();
  if (!amountSupported(provider.amountRange, price)) return { ok: false, reason: "amountNotSupported" };
  return createOrderWithPayment(
    {
      userId: input.userId,
      subtotalVnd: price,
      discountVnd: 0,
      totalVnd: price,
      couponId: null,
      buyerName: profile.name ?? profile.email,
      buyerEmail: profile.email,
      locale: input.locale,
      isDemo: provider.testMode,
      expiresAt: new Date(now.getTime() + ORDER_TTL_MINUTES * 60_000),
      items: [
        {
          productId: pack!.id,
          productType: "FREE",
          kind: "EXTRA_DOWNLOADS",
          extraDownloads: offer.count,
          titleSnapshot: pickTranslation(pack!.translations, input.locale)?.title ?? pack!.slug,
          priceSnapshotVnd: price,
          licenseId: license!.id,
          licenseSnapshot: {
            code: license!.code,
            name: pickTranslation(license!.translations, input.locale)?.name ?? license!.code,
            commercial: license!.allowCommercial,
            modification: license!.allowModification,
            multiProject: license!.allowMultiProject,
            redistribution: license!.allowRedistribution,
            resale: license!.allowResale,
          },
          versionId: pack!.currentVersionId,
        },
      ],
    },
    now,
    input.origin,
  );
}

export type OrderView = {
  code: string;
  status: OrderStatus;
  isDemo: boolean;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  couponCode: string | null;
  buyerName: string;
  buyerEmail: string;
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
  items: {
    productId: string;
    slug: string;
    title: string;
    priceVnd: number;
    isDemoData: boolean;
    thumbnail: MediaData | null;
    /** EXTRA_DOWNLOADS: this line bought more downloads of a free pack (null = the pack itself). */
    extraDownloads: number | null;
  }[];
  /** Every line is "more downloads" (step 4.6): the result page talks about downloads, not new packs. */
  extraDownloadsOnly: boolean;
  /** Where to continue paying while the order is PENDING (the demo gateway page, or MoMo's payment page). */
  payment: { providerTxnId: string | null; status: string; provider: string; resumeUrl: string | null } | null;
  /** SePay: where and how to transfer (shown while the order waits for the money). */
  bankTransfer: BankTransferView | null;
};

export type BankTransferView = {
  bankName: string;
  account: string;
  accountName: string | null;
  amountVnd: number;
  /** What the buyer writes in the transfer memo (the order code without dashes). */
  memo: string;
  qrUrl: string;
  /** SePay Test mode: no money moves — the page hides the QR and explains how to simulate the transfer. */
  testMode: boolean;
};

/** Transfer details for a SePay payment, from this shop's configuration (never from the client). */
function bankTransferOf(payment: { provider: string; providerTxnId: string | null } | undefined, amountVnd: number): BankTransferView | null {
  if (!payment || payment.provider !== "SEPAY" || !payment.providerTxnId) return null;
  const env = getEnv();
  if (env.PAYMENT_PROVIDER !== "sepay" || !env.SEPAY_BANK_ACCOUNT || !env.SEPAY_BANK_NAME) return null;
  const memo = payment.providerTxnId;
  return {
    bankName: env.SEPAY_BANK_NAME,
    account: env.SEPAY_BANK_ACCOUNT,
    accountName: env.SEPAY_ACCOUNT_NAME ?? null,
    amountVnd,
    memo,
    qrUrl: sepayQrImageUrl({ account: env.SEPAY_BANK_ACCOUNT, bank: env.SEPAY_BANK_NAME, amountVnd, memo }),
    testMode: env.SEPAY_MODE === "test",
  };
}

export async function getOrderForUser(
  code: string,
  userId: string,
  locale: Locale,
  now = new Date(),
): Promise<OrderView | null> {
  if (code.length > 32) return null;
  const o = await findOrderForUser(code, userId, locale);
  if (!o) return null;
  return {
    code: o.code,
    status: effectiveOrderStatus(o, now),
    isDemo: o.isDemo,
    subtotalVnd: o.subtotalVnd,
    discountVnd: o.discountVnd,
    totalVnd: o.totalVnd,
    couponCode: o.coupon?.code ?? null,
    buyerName: o.buyerName,
    buyerEmail: o.buyerEmail,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    expiresAt: o.expiresAt,
    items: o.items.map((i) => ({
      productId: i.productId,
      slug: i.product.slug,
      // The title bought (snapshot), in the buyer's language when the pack is translated.
      title: pickTranslation(i.product.translations, locale)?.title ?? i.titleSnapshot,
      priceVnd: i.priceSnapshotVnd,
      isDemoData: i.product.isDemoData,
      thumbnail: i.product.media[0] ? toMedia(i.product.media[0]) : null,
      extraDownloads: i.kind === "EXTRA_DOWNLOADS" ? i.extraDownloads : null,
    })),
    extraDownloadsOnly: o.items.length > 0 && o.items.every((i) => i.kind === "EXTRA_DOWNLOADS"),
    // Only the fields the page needs: the raw gateway payload (signature…) never leaves the server.
    payment: o.payments[0]
      ? {
          provider: o.payments[0].provider,
          providerTxnId: o.payments[0].providerTxnId,
          status: o.payments[0].status,
          resumeUrl: resumeUrlOf(o.payments[0].rawPayload),
        }
      : null,
    bankTransfer: bankTransferOf(o.payments[0], o.totalVnd),
  };
}

/** Orders per page in the order history (user request 2026-11-20: at most 5 per page). */
export const ORDERS_PAGE_SIZE = 5;

export type OrderListItem = {
  code: string;
  status: OrderStatus;
  totalVnd: number;
  isDemo: boolean;
  createdAt: Date;
  /** One per line; extraDownloads set for a "more downloads" line. */
  lines: { title: string; extraDownloads: number | null }[];
};

/** Order history, one page at a time (page numbers past the end are clamped). */
export async function listOrdersForUser(userId: string, locale: Locale, page: number, now = new Date()) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findOrdersPage(userId, locale, (safePage - 1) * ORDERS_PAGE_SIZE, ORDERS_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  if (safePage > pageCount && total > 0) return listOrdersForUser(userId, locale, pageCount, now);
  const items: OrderListItem[] = rows.map((o) => ({
    code: o.code,
    status: effectiveOrderStatus(o, now),
    totalVnd: o.totalVnd,
    isDemo: o.isDemo,
    createdAt: o.createdAt,
    lines: o.items.map((i) => ({
      title: pickTranslation(i.product.translations, locale)?.title ?? i.titleSnapshot,
      extraDownloads: i.kind === "EXTRA_DOWNLOADS" ? i.extraDownloads : null,
    })),
  }));
  return { items, total, page: Math.min(safePage, pageCount), pageCount };
}

/** The gateway page saved when the payment started (MoMo payUrl); only MoMo's own https pages are offered. */
function resumeUrlOf(raw: unknown): string | null {
  const url = raw && typeof raw === "object" && "resumeUrl" in raw ? (raw as { resumeUrl: unknown }).resumeUrl : null;
  return typeof url === "string" && isMomoPayUrl(url) ? url : null;
}
