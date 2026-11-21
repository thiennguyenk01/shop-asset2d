import "server-only";
import type { Locale } from "@backend/i18n/routing";
import {
  ADMIN_ORDERS_PAGE_SIZE,
  orderMoneySummary,
  type OrderMoneySummary,
  parseRefundReason,
  refundBlock,
  type RefundBlock,
  type RefundReasonError,
} from "@backend/lib/admin/order-rules";
import { pickTranslation } from "@backend/lib/format";
import { effectiveOrderStatus, ORDER_CODE_RE, type OrderStatus } from "@backend/lib/payment/rules";
import { toMedia, type MediaData } from "@backend/modules/product/queries";
import { findAdminOrder, findAdminOrderMoney, findAdminOrdersPage, findOrderForRefund, refundOrderRows } from "./admin-repository";
import { createManualOrderRows, findOpenTransfersForLinking } from "./admin-manual-repository";
import { parseManualOrderForm, type ManualOrderError } from "@backend/lib/admin/manual-order-rules";

/**
 * Admin orders + refunds (GĐ5.4). The page and action layers check the Admin; this layer applies the rules
 * (lib/admin/order-rules.ts) and reads / writes through the repository.
 */
export type AdminOrderListItem = {
  code: string;
  status: OrderStatus;
  totalVnd: number;
  isDemo: boolean;
  createdAt: Date;
  buyerName: string;
  buyerEmail: string;
  lines: { title: string; extraDownloads: number | null }[];
};

export async function listAdminOrders(
  filters: { q: string; status?: OrderStatus },
  locale: Locale,
  page: number,
  size: number = ADMIN_ORDERS_PAGE_SIZE,
  now = new Date(),
) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findAdminOrdersPage(filters, locale, (safePage - 1) * size, size, now);
  const pageCount = Math.max(1, Math.ceil(total / size));
  if (safePage > pageCount && total > 0) return listAdminOrders(filters, locale, pageCount, size, now);
  const items: AdminOrderListItem[] = rows.map((o) => ({
    code: o.code,
    status: effectiveOrderStatus(o, now),
    totalVnd: o.totalVnd,
    isDemo: o.isDemo,
    createdAt: o.createdAt,
    buyerName: o.buyerName,
    buyerEmail: o.buyerEmail,
    lines: o.items.map((i) => ({
      title: pickTranslation(i.product.translations, locale)?.title ?? i.titleSnapshot,
      extraDownloads: i.kind === "EXTRA_DOWNLOADS" ? i.extraDownloads : null,
    })),
  }));
  return { items, total, page: Math.min(safePage, pageCount), pageCount };
}

/** Finance figures of every order the list filters match (user request 2026-11-21; no chart). */
export async function getAdminOrderMoney(filters: { q: string; status?: OrderStatus }, now = new Date()): Promise<OrderMoneySummary> {
  const [groups, overdue] = await findAdminOrderMoney(filters, now);
  return orderMoneySummary(
    groups.map((g) => ({ status: g.status, isDemo: g.isDemo, orders: g._count._all, totalVnd: g._sum.totalVnd ?? 0, discountVnd: g._sum.discountVnd ?? 0 })),
    overdue.map((g) => ({ isDemo: g.isDemo, orders: g._count._all, totalVnd: g._sum.totalVnd ?? 0, discountVnd: g._sum.discountVnd ?? 0 })),
  );
}

export type AdminOrderView = {
  code: string;
  status: OrderStatus;
  isDemo: boolean;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  couponCode: string | null;
  locale: string;
  buyerName: string;
  buyerEmail: string;
  account: { id: string; email: string; name: string | null; status: string };
  createdAt: Date;
  paidAt: Date | null;
  expiresAt: Date | null;
  items: {
    productId: string;
    slug: string;
    title: string;
    titleSnapshot: string;
    priceVnd: number;
    productType: "FREE" | "PREMIUM";
    extraDownloads: number | null;
    version: string | null;
    isDemoData: boolean;
    thumbnail: MediaData | null;
    /** PACK lines: access granted by this order — "active", "revoked", or null when this order granted none. */
    access: "active" | "revoked" | null;
  }[];
  payments: {
    id: string;
    provider: string;
    providerTxnId: string | null;
    amountVnd: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  refunds: {
    id: string;
    amountVnd: number;
    reason: string;
    status: string;
    createdAt: Date;
    adminEmail: string;
    adminName: string | null;
  }[];
  /** Why the refund button is not offered (null = it is). */
  refundBlock: RefundBlock | null;
};

export async function getAdminOrder(code: string, locale: Locale, now = new Date()): Promise<AdminOrderView | null> {
  if (!ORDER_CODE_RE.test(code)) return null;
  const o = await findAdminOrder(code, locale);
  if (!o) return null;
  const status = effectiveOrderStatus(o, now);
  const access = new Map(
    o.entitlements.map((e) => [e.productId, e.revokedAt ? ("revoked" as const) : ("active" as const)]),
  );
  return {
    code: o.code,
    status,
    isDemo: o.isDemo,
    subtotalVnd: o.subtotalVnd,
    discountVnd: o.discountVnd,
    totalVnd: o.totalVnd,
    couponCode: o.coupon?.code ?? null,
    locale: o.locale,
    buyerName: o.buyerName,
    buyerEmail: o.buyerEmail,
    account: { id: o.user.id, email: o.user.email, name: o.user.name, status: o.user.status },
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    expiresAt: o.expiresAt,
    items: o.items.map((i) => ({
      productId: i.productId,
      slug: i.product.slug,
      title: pickTranslation(i.product.translations, locale)?.title ?? i.titleSnapshot,
      titleSnapshot: i.titleSnapshot,
      priceVnd: i.priceSnapshotVnd,
      productType: i.productType,
      extraDownloads: i.kind === "EXTRA_DOWNLOADS" ? i.extraDownloads : null,
      version: i.version?.version ?? null,
      isDemoData: i.product.isDemoData,
      thumbnail: i.product.media[0] ? toMedia(i.product.media[0]) : null,
      access: i.kind === "PACK" ? (access.get(i.productId) ?? null) : null,
    })),
    payments: o.payments,
    refunds: o.refunds.map((r) => ({
      id: r.id,
      amountVnd: r.amountVnd,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt,
      adminEmail: r.admin.email,
      adminName: r.admin.name,
    })),
    refundBlock: refundBlock({ status, totalVnd: o.totalVnd }),
  };
}

export type RefundError = "notFound" | RefundBlock | RefundReasonError;
export type RefundResult = { ok: true; revoked: number } | { ok: false; error: RefundError };

/** Refund a whole PAID order (DECISIONS #33). Safe to call twice at once: exactly one call refunds. */
export async function refundAdminOrder(
  code: string,
  rawReason: unknown,
  adminId: string,
  now = new Date(),
): Promise<RefundResult> {
  const reason = parseRefundReason(rawReason);
  if (!reason.ok) return reason;
  if (typeof code !== "string" || !ORDER_CODE_RE.test(code)) return { ok: false, error: "notFound" };
  const order = await findOrderForRefund(code);
  if (!order) return { ok: false, error: "notFound" };
  const block = refundBlock({ status: effectiveOrderStatus(order, now), totalVnd: order.totalVnd });
  if (block) return { ok: false, error: block };
  return refundOrderRows(order.id, reason.reason, adminId, now);
}

export type ManualOrderResult =
  | { ok: true; code: string }
  | { ok: false; error: ManualOrderError | "userNotFound" | "packUnavailable" | "alreadyOwned" | "transferUnavailable" };

/**
 * An order the Admin records by hand (user choice 2026-11-21: the customer paid by a private transfer). The form is
 * checked by lib/admin/manual-order-rules.ts; prices, ownership and the linked transfer are re-read in the write.
 */
export async function createManualOrder(
  userId: string,
  form: { productIds: unknown[]; amount: unknown; note: unknown; transferId: unknown },
  adminId: string,
  now = new Date(),
): Promise<ManualOrderResult> {
  if (typeof userId !== "string" || !/^[a-z0-9]{10,40}$/.test(userId)) return { ok: false, error: "userNotFound" };
  const parsed = parseManualOrderForm(form);
  if (!parsed.ok) return parsed;
  return createManualOrderRows({ userId, ...parsed.input, adminId, now });
}

/** Unmatched transfers still open, for the "link to a transfer" choice of the manual order form. */
export async function listOpenTransfersForLinking() {
  const rows = await findOpenTransfersForLinking();
  return rows.map((r) => ({ id: r.id, amountVnd: r.amountVnd, content: r.content, isDemo: r.isDemo, at: r.transferredAt ?? r.createdAt }));
}
