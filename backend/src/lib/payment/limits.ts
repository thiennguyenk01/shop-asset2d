import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";

/** MoMo refuses wallet payments outside this range (VND). Separate from momo.ts so client code can show it. */
export const MOMO_MIN_AMOUNT = 1_000;
export const MOMO_MAX_AMOUNT = 50_000_000;

/** Bank transfers through SePay: 1.000 ₫ (SePay's smallest test transfer) to 499.000.000 ₫ (its largest). */
export const SEPAY_MIN_AMOUNT = 1_000;
export const SEPAY_MAX_AMOUNT = 499_000_000;

export type AmountRange = { min: number; max: number };

/**
 * Values for the "amountNotSupported" messages: the active gateway's range (sent back by the server with the
 * error), in the shop's money format; other messages ignore them.
 */
export function gatewayLimits(locale: Locale, range?: AmountRange) {
  const r = range ?? { min: MOMO_MIN_AMOUNT, max: MOMO_MAX_AMOUNT };
  return { min: formatVnd(r.min, locale), max: formatVnd(r.max, locale) };
}
