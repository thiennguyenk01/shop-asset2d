import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";
import type { ProviderId } from "@backend/modules/payment/providers";

/** What each order line snapshots: the pack's terms (flags + localized name) and its current version. */
export function findCheckoutSnapshots(userId: string, productIds: string[], locale: Locale) {
  return getDb().cartItem.findMany({
    where: { cart: { userId }, productId: { in: productIds } },
    select: {
      productId: true,
      license: {
        select: {
          id: true,
          code: true,
          allowCommercial: true,
          allowModification: true,
          allowMultiProject: true,
          allowRedistribution: true,
          allowResale: true,
          translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } },
        },
      },
      product: { select: { type: true, currentVersionId: true } },
    },
  });
}

/** A free pack as the "more downloads" order needs it: status, title, version and its default terms. */
export function findPackForExtraDownloads(productId: string, locale: Locale) {
  return getDb().product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      type: true,
      status: true,
      slug: true,
      currentVersionId: true,
      translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
      licenses: {
        where: { isDefault: true },
        take: 1,
        select: {
          license: {
            select: {
              id: true,
              code: true,
              allowCommercial: true,
              allowModification: true,
              allowMultiProject: true,
              allowRedistribution: true,
              allowResale: true,
              translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } },
            },
          },
        },
      },
    },
  });
}

export async function findCouponId(code: string): Promise<string | null> {
  return (await getDb().coupon.findUnique({ where: { code }, select: { id: true } }))?.id ?? null;
}

export type NewOrder = {
  code: string;
  userId: string;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  couponId: string | null;
  buyerName: string;
  buyerEmail: string;
  locale: Locale;
  isDemo: boolean;
  expiresAt: Date;
  items: {
    productId: string;
    productType: "FREE" | "PREMIUM";
    /** Default PACK; EXTRA_DOWNLOADS adds extraDownloads downloads of a free pack (step 4.6). */
    kind?: "PACK" | "EXTRA_DOWNLOADS";
    extraDownloads?: number | null;
    titleSnapshot: string;
    priceSnapshotVnd: number;
    licenseId: string;
    licenseSnapshot: Record<string, string | boolean>;
    versionId: string | null;
  }[];
};

/** An order still waiting for its payment: PENDING and not past its expiry (user choice 2026-11-26). */
const openOrderWhere = (now: Date) => ({ status: "PENDING" as const, expiresAt: { gt: now } });

/** This account's order still waiting for its payment, if any (the newest one). */
export function findOpenOrder(userId: string, now: Date) {
  return getDb().order.findFirst({
    where: { userId, ...openOrderWhere(now) },
    orderBy: { createdAt: "desc" },
    select: { code: true, totalVnd: true, expiresAt: true, payments: { select: { provider: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
}

export type InsertOrderResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: "pendingOrder"; orderCode: string }
  | { ok: false; reason: "couponUsedUp" };

/**
 * Order + its lines in one write (PENDING), in a transaction that first locks this account's row and, with a
 * coupon, the coupon's row (user choice 2026-11-26):
 * - one order waiting for payment per account: another open one → refused, the buyer pays or cancels it first;
 * - a coupon with a limit is held by the open orders using it: paid uses + open orders must stay under the limit
 *   (all accounts, and this account for the per-account limit). Two orders placed at the same moment wait on the
 *   lock, so they cannot both take the last use. An order that expires or is cancelled gives its use back.
 */
export function insertOrder(order: NewOrder, now: Date): Promise<InsertOrderResult> {
  const { items, ...data } = order;
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${order.userId} FOR UPDATE`;
    const open = await tx.order.findFirst({ where: { userId: order.userId, ...openOrderWhere(now) }, select: { code: true } });
    if (open) return { ok: false as const, reason: "pendingOrder" as const, orderCode: open.code };

    if (order.couponId) {
      await tx.$queryRaw`SELECT id FROM "Coupon" WHERE id = ${order.couponId} FOR UPDATE`;
      const coupon = await tx.coupon.findUnique({ where: { id: order.couponId }, select: { maxUses: true, maxUsesPerUser: true, usedCount: true } });
      if (!coupon) return { ok: false as const, reason: "couponUsedUp" as const };
      if (coupon.maxUses !== null) {
        const held = await tx.order.count({ where: { couponId: order.couponId, ...openOrderWhere(now) } });
        if (coupon.usedCount + held >= coupon.maxUses) return { ok: false as const, reason: "couponUsedUp" as const };
      }
      if (coupon.maxUsesPerUser !== null) {
        const [paid, held] = await Promise.all([
          tx.couponRedemption.count({ where: { couponId: order.couponId, userId: order.userId } }),
          tx.order.count({ where: { couponId: order.couponId, userId: order.userId, ...openOrderWhere(now) } }),
        ]);
        if (paid + held >= coupon.maxUsesPerUser) return { ok: false as const, reason: "couponUsedUp" as const };
      }
    }

    const created = await tx.order.create({ data: { ...data, status: "PENDING", items: { create: items } }, select: { id: true, code: true } });
    return { ok: true as const, ...created };
  });
}

export type CancelOrderResult = { ok: true } | { ok: false; reason: "notFound" | "notOpen" | "gateway" };

/**
 * The buyer cancels their own order still waiting for payment (user choice 2026-11-26). Payment and order move
 * PENDING → CANCELLED together, each conditional on PENDING: if the payment was settled meanwhile, nothing changes.
 * A bank transfer that arrives later for this order is kept for an Admin ("unmatched", ORDER_CLOSED).
 * MoMo is refused: its own payment page would still take the money (MoMo is paused, DECISIONS #42).
 */
export async function cancelOpenOrder(userId: string, code: string, now: Date): Promise<CancelOrderResult> {
  try {
    return await cancelOpenOrderTx(userId, code, now);
  } catch (e) {
    if (e instanceof OrderNoLongerOpen) return { ok: false, reason: "notOpen" };
    throw e;
  }
}

/** Thrown inside the transaction so the payment change rolls back when the order moved on meanwhile. */
class OrderNoLongerOpen extends Error {}

function cancelOpenOrderTx(userId: string, code: string, now: Date): Promise<CancelOrderResult> {
  return getDb().$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { code, userId },
      select: { id: true, status: true, expiresAt: true, payments: { select: { provider: true } } },
    });
    if (!order) return { ok: false as const, reason: "notFound" as const };
    if (order.status !== "PENDING" || !order.expiresAt || order.expiresAt <= now) return { ok: false as const, reason: "notOpen" as const };
    if (order.payments.some((p) => p.provider === "MOMO")) return { ok: false as const, reason: "gateway" as const };
    await tx.payment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    const moved = await tx.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (moved.count === 0) throw new OrderNoLongerOpen();
    return { ok: true as const };
  });
}

export function insertPayment(orderId: string, provider: ProviderId, providerTxnId: string, amountVnd: number, resumeUrl?: string) {
  return getDb().payment.create({
    data: { orderId, provider, providerTxnId, amountVnd, status: "PENDING", ...(resumeUrl ? { rawPayload: { resumeUrl } } : {}) },
    select: { id: true },
  });
}

/** The gateway did not start the payment: the order never reached it (conditional on PENDING). */
export function markOrderFailed(orderId: string) {
  return getDb().order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "FAILED" } });
}

/** An order as its owner sees it (never another user's: the userId is part of the lookup). */
export function findOrderForUser(code: string, userId: string, locale: Locale) {
  return getDb().order.findFirst({
    where: { code, userId },
    select: {
      code: true,
      status: true,
      subtotalVnd: true,
      discountVnd: true,
      totalVnd: true,
      buyerName: true,
      buyerEmail: true,
      isDemo: true,
      createdAt: true,
      paidAt: true,
      expiresAt: true,
      coupon: { select: { code: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          kind: true,
          extraDownloads: true,
          titleSnapshot: true,
          priceSnapshotVnd: true,
          product: {
            select: {
              slug: true,
              isDemoData: true,
              translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
              media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, providerTxnId: true, status: true, rawPayload: true } },
    },
  });
}

/** A payment of the given provider, with the order fields the event check and the settlement need. */
export function findPaymentByTxn(provider: ProviderId, providerTxnId: string) {
  return getDb().payment.findUnique({
    where: { provider_providerTxnId: { provider, providerTxnId } },
    select: {
      id: true,
      status: true,
      amountVnd: true,
      providerTxnId: true,
      order: {
        select: {
          id: true,
          code: true,
          status: true,
          totalVnd: true,
          userId: true,
          couponId: true,
          expiresAt: true,
          isDemo: true,
          items: { select: { productId: true, licenseId: true, kind: true, extraDownloads: true } },
        },
      },
    },
  });
}

/** One page of a user's orders, newest first (order history). */
export function findOrdersPage(userId: string, locale: Locale, skip: number, take: number) {
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().order.count({ where: { userId } }),
    getDb().order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        code: true,
        status: true,
        expiresAt: true,
        totalVnd: true,
        isDemo: true,
        createdAt: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            kind: true,
            extraDownloads: true,
            titleSnapshot: true,
            product: { select: { translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } } } },
          },
        },
      },
    }),
  ]);
}
