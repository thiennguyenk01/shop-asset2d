/**
 * Orders an Admin records by hand (user choice 2026-11-21): the customer messaged the shop and paid by a private
 * transfer, so the Admin creates a PAID order with the packs and the amount received. Pure, unit-tested.
 * - only Premium packs on sale that the customer does not own (same rule as gifting, DECISIONS #34), 1–20 of them;
 * - the amount received is a whole number of đồng, at least 1 ₫ and at most the packs' list price; any difference
 *   is recorded as a discount (the database requires total = subtotal − discount, discount ≥ 0);
 * - a note on how the customer paid is required (≤ 500 characters).
 */
export const MANUAL_ORDER_MAX_PACKS = 20;
export const MANUAL_NOTE_MAX = 500;

export type ManualOrderError =
  | "pickPack"
  | "tooManyPacks"
  | "amountInvalid"
  | "amountTooHigh"
  | "noteRequired"
  | "noteTooLong";

export type ManualOrderInput = { productIds: string[]; amountVnd: number; note: string; transferId: string | null };

const ID_RE = /^[a-z0-9]{10,40}$/;

/** Form fields → a checked input (ids deduplicated; a bad transfer id is dropped, never an error). */
export function parseManualOrderForm(raw: {
  productIds: unknown[];
  amount: unknown;
  note: unknown;
  transferId: unknown;
}): { ok: true; input: ManualOrderInput } | { ok: false; error: ManualOrderError } {
  const productIds = [...new Set(raw.productIds.filter((v): v is string => typeof v === "string" && ID_RE.test(v)))];
  if (productIds.length === 0) return { ok: false, error: "pickPack" };
  if (productIds.length > MANUAL_ORDER_MAX_PACKS) return { ok: false, error: "tooManyPacks" };
  const text = typeof raw.amount === "string" ? raw.amount.replace(/[\s.,₫]/g, "") : "";
  const amountVnd = /^\d{1,12}$/.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(amountVnd) || amountVnd < 1) return { ok: false, error: "amountInvalid" };
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (!note) return { ok: false, error: "noteRequired" };
  if (note.length > MANUAL_NOTE_MAX) return { ok: false, error: "noteTooLong" };
  const transferId = typeof raw.transferId === "string" && ID_RE.test(raw.transferId) ? raw.transferId : null;
  return { ok: true, input: { productIds, amountVnd, note, transferId } };
}

/** Order amounts for the packs' list prices and the amount received. */
export function manualOrderAmounts(
  prices: number[],
  amountVnd: number,
): { ok: true; subtotalVnd: number; discountVnd: number; totalVnd: number } | { ok: false; error: "amountTooHigh" } {
  const subtotalVnd = prices.reduce((a, b) => a + b, 0);
  if (amountVnd > subtotalVnd) return { ok: false, error: "amountTooHigh" };
  return { ok: true, subtotalVnd, discountVnd: subtotalVnd - amountVnd, totalVnd: amountVnd };
}

/**
 * The amount box as the Admin types it, grouped for reading in the page language ("3970000" → "3.970.000" in
 * Vietnamese). Only digits are kept (at most 12, leading zeros dropped); the server parser ignores the separators.
 */
export function formatAmountInput(raw: string, locale: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);
  return digits ? new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(digits)) : "";
}
