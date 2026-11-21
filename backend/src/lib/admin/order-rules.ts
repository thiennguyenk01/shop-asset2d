import type { OrderStatus } from "@backend/lib/payment/rules";

/**
 * Admin orders + refunds (GĐ5.4, DECISIONS #33), pure so they are unit-tested:
 * - a refund covers the WHOLE order and only a PAID order can be refunded (one step, by an Admin, with a reason);
 * - bought "more downloads" are taken back in full, never below zero (even if some were already used);
 * - list filters from the URL: unknown values are ignored, never an error.
 */
export const ADMIN_ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
] as const satisfies readonly OrderStatus[];
/** Orders per page of the Admin list: fixed at 7 (user choice 2026-11-21). */
export const ADMIN_ORDERS_PAGE_SIZE = 7;
export const ADMIN_ORDER_SEARCH_MAX = 80;
export const REFUND_REASON_MAX = 500;

/**
 * Why an order cannot be refunded. `nothingToRefund`: a 0 ₫ order (100 % coupon) — the refund record needs a
 * positive amount (database CHECK), so there is no money to give back.
 */
export type RefundBlock = "notPaid" | "nothingToRefund";

/** `status` is the effective status (a PENDING order past its expiry is EXPIRED). */
export function refundBlock(order: { status: OrderStatus; totalVnd: number }): RefundBlock | null {
  if (order.status !== "PAID") return "notPaid";
  if (order.totalVnd <= 0) return "nothingToRefund";
  return null;
}

export type RefundReasonError = "reasonRequired" | "reasonTooLong";

/** The Admin's reason: required, trimmed, at most REFUND_REASON_MAX characters. */
export function parseRefundReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; error: RefundReasonError } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (!reason) return { ok: false, error: "reasonRequired" };
  if (reason.length > REFUND_REASON_MAX) return { ok: false, error: "reasonTooLong" };
  return { ok: true, reason };
}

/** Bought downloads left after a refund takes back `refunded` of them (never negative). */
export function creditAfterRefund(current: number, refunded: number): number {
  return Math.max(0, current - Math.max(0, refunded));
}

export type AdminOrderFilters = { q: string; status: OrderStatus | undefined; page: number };

/** URL search params of the Admin order list → safe filters (bad values dropped, page ≥ 1). */
export function parseAdminOrderFilters(raw: { q?: string; status?: string; page?: string }): AdminOrderFilters {
  const q = (raw.q ?? "").trim().slice(0, ADMIN_ORDER_SEARCH_MAX);
  const status = ADMIN_ORDER_STATUSES.find((s) => s === raw.status);
  const n = Number(raw.page ?? 1);
  return { q, status, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
}

/** Money of a group of orders: how many, and their totals (VND). */
export type MoneyCount = { orders: number; totalVnd: number };

/**
 * Money of the orders an Admin list shows (step after SePay, user request 2026-11-21: finance figures on the order
 * page, no chart). Real and Demo money are kept apart, like the statistics page (DECISIONS #36): the tiles count
 * real orders only.
 * - paid: PAID (money kept) · refunded: REFUNDED (money given back) · pending: still waiting for the money ·
 *   unpaid: EXPIRED / FAILED / CANCELLED (no money);
 * - discountVnd: coupon discounts on PAID orders · averagePaidVnd: rounded mean of a PAID order (0 when none).
 */
export type MoneyBucket = {
  all: MoneyCount;
  paid: MoneyCount;
  refunded: MoneyCount;
  pending: MoneyCount;
  unpaid: MoneyCount;
  discountVnd: number;
  averagePaidVnd: number;
};
export type OrderMoneySummary = { real: MoneyBucket; demo: MoneyBucket };

export type OrderMoneyGroup = { status: OrderStatus; isDemo: boolean; orders: number; totalVnd: number; discountVnd: number };

const emptyCount = (): MoneyCount => ({ orders: 0, totalVnd: 0 });
const emptyBucket = (): MoneyBucket => ({
  all: emptyCount(),
  paid: emptyCount(),
  refunded: emptyCount(),
  pending: emptyCount(),
  unpaid: emptyCount(),
  discountVnd: 0,
  averagePaidVnd: 0,
});

/**
 * Sums database groups (status × isDemo). `overdue` = the PENDING orders already past their expiry: they count as
 * EXPIRED (the same lazy rule as the list, lib/payment/rules.ts), so they move from "pending" to "unpaid".
 */
export function orderMoneySummary(groups: OrderMoneyGroup[], overdue: Omit<OrderMoneyGroup, "status">[] = []): OrderMoneySummary {
  const out: OrderMoneySummary = { real: emptyBucket(), demo: emptyBucket() };
  const add = (c: MoneyCount, orders: number, vnd: number) => {
    c.orders += orders;
    c.totalVnd += vnd;
  };
  for (const g of groups) {
    const b = g.isDemo ? out.demo : out.real;
    add(b.all, g.orders, g.totalVnd);
    if (g.status === "PAID") {
      add(b.paid, g.orders, g.totalVnd);
      b.discountVnd += g.discountVnd;
    } else if (g.status === "REFUNDED") add(b.refunded, g.orders, g.totalVnd);
    else if (g.status === "PENDING") add(b.pending, g.orders, g.totalVnd);
    else add(b.unpaid, g.orders, g.totalVnd);
  }
  for (const o of overdue) {
    const b = o.isDemo ? out.demo : out.real;
    const orders = Math.min(o.orders, b.pending.orders);
    const vnd = Math.min(o.totalVnd, b.pending.totalVnd);
    add(b.pending, -orders, -vnd);
    add(b.unpaid, orders, vnd);
  }
  for (const b of [out.real, out.demo]) b.averagePaidVnd = b.paid.orders > 0 ? Math.round(b.paid.totalVnd / b.paid.orders) : 0;
  return out;
}
