/**
 * Payment rules (CLAUDE.md §6), pure so they are unit-tested:
 * - order codes are short, readable and unambiguous;
 * - a payment event only moves an order when it names the right order and the exact amount, and only while
 *   both the order and the payment are still PENDING (anything later is a duplicate / late event → ignored);
 *   bank transfers (SePay) may also settle an EXPIRED order whose payment is still PENDING (user choice
 *   2026-11-20: the buyer paid the exact amount, only late).
 */
export const ORDER_TTL_MINUTES = 30;

/** No 0/O/1/I/L — codes are read aloud and typed by customers. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ORDER_CODE_RE = /^AG-\d{8}-[2-9A-HJKMNP-Z]{6}$/;

/** e.g. AG-20261114-7F3KQ2. `randomBytes` must be 6 bytes of cryptographic randomness. */
export function makeOrderCode(now: Date, randomBytes: Uint8Array): string {
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Array.from(randomBytes.slice(0, 6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `AG-${ymd}-${suffix}`;
}

export type PaymentEventStatus = "SUCCEEDED" | "FAILED" | "CANCELLED";
export type OrderStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED" | "REFUNDED";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type PaymentEventCheck =
  | { kind: "apply"; status: PaymentEventStatus }
  /** Already settled (duplicate, late or out-of-order event): acknowledge, change nothing. */
  | { kind: "ignore" }
  /** The event does not describe this payment: refuse it, change nothing. */
  | { kind: "reject"; reason: "orderMismatch" | "amountMismatch" };

export function checkPaymentEvent(input: {
  order: { code: string; status: OrderStatus; totalVnd: number };
  payment: { status: PaymentStatus; amountVnd: number };
  event: { orderCode: string; amountVnd: number; status: PaymentEventStatus };
  /** Bank transfer: an EXPIRED order can still be paid (never a cancelled, failed, paid or refunded one). */
  acceptExpired?: boolean;
}): PaymentEventCheck {
  const { order, payment, event } = input;
  if (event.orderCode !== order.code) return { kind: "reject", reason: "orderMismatch" };
  if (!Number.isSafeInteger(event.amountVnd) || event.amountVnd !== order.totalVnd || event.amountVnd !== payment.amountVnd) {
    return { kind: "reject", reason: "amountMismatch" };
  }
  const orderOpen = order.status === "PENDING" || (input.acceptExpired === true && order.status === "EXPIRED");
  if (payment.status !== "PENDING" || !orderOpen) return { kind: "ignore" };
  return { kind: "apply", status: event.status };
}

/** Order status after a settled payment event. */
export function orderStatusAfter(event: PaymentEventStatus): OrderStatus {
  if (event === "SUCCEEDED") return "PAID";
  return event === "CANCELLED" ? "CANCELLED" : "FAILED";
}

/** A PENDING order past its expiry is EXPIRED (read lazily; the reconcile cron arrives in Phase 6). */
export function effectiveOrderStatus(order: { status: OrderStatus; expiresAt: Date | null }, now: Date): OrderStatus {
  if (order.status === "PENDING" && order.expiresAt && order.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return order.status;
}
