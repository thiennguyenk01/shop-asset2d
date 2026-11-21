/**
 * Shop settings the Admin edits (GĐ5.6, DECISIONS #35), pure so they are unit-tested. Today: the "buy more
 * downloads" offer for free packs (DECISIONS #28) — downloads per purchase and its price. The two free downloads
 * every account starts with stay fixed (FREE_DOWNLOADS_PER_PACK). The same limits are CHECKs in the database.
 */
export const EXTRA_COUNT_MIN = 1;
export const EXTRA_COUNT_MAX = 100;
/** Not 0 ₫: a 0 ₫ order cannot be refunded (PENDING in DECISIONS) and would hand out downloads for nothing. */
export const EXTRA_PRICE_MIN_VND = 1_000;
export const EXTRA_PRICE_MAX_VND = 10_000_000;

export type ExtraDownloadsSettings = { count: number; priceVnd: number };
export type SettingsField = "extraDownloadsCount" | "extraDownloadsPriceVnd";
export type SettingsError = "required" | "notWhole" | "outOfRange";

/**
 * A whole number typed by a person. Spaces are ignored; for amounts of money (`money`) so are the thousands
 * separators "." and "," ("10.000" = "10,000" = 10000). A count or a percentage takes digits only, so "2,5" is
 * refused rather than read as 25. Empty → null; anything else that is not digits → NaN.
 */
export function parseWholeNumber(raw: unknown, money = false): number | null {
  const text = typeof raw === "string" ? raw.replace(money ? /[\s.,]/g : /\s/g, "") : "";
  if (!text) return null;
  if (!/^\d{1,12}$/.test(text)) return Number.NaN;
  return Number(text);
}

function inRange(
  raw: unknown,
  min: number,
  max: number,
  money: boolean,
): { ok: true; n: number } | { ok: false; error: SettingsError } {
  const n = parseWholeNumber(raw, money);
  if (n === null) return { ok: false, error: "required" };
  if (!Number.isSafeInteger(n)) return { ok: false, error: "notWhole" };
  if (n < min || n > max) return { ok: false, error: "outOfRange" };
  return { ok: true, n };
}

export function parseSettingsForm(raw: {
  extraDownloadsCount?: unknown;
  extraDownloadsPriceVnd?: unknown;
}): { ok: true; value: ExtraDownloadsSettings } | { ok: false; fields: Partial<Record<SettingsField, SettingsError>> } {
  const count = inRange(raw.extraDownloadsCount, EXTRA_COUNT_MIN, EXTRA_COUNT_MAX, false);
  const price = inRange(raw.extraDownloadsPriceVnd, EXTRA_PRICE_MIN_VND, EXTRA_PRICE_MAX_VND, true);
  if (count.ok && price.ok) return { ok: true, value: { count: count.n, priceVnd: price.n } };
  const fields: Partial<Record<SettingsField, SettingsError>> = {};
  if (!count.ok) fields.extraDownloadsCount = count.error;
  if (!price.ok) fields.extraDownloadsPriceVnd = price.error;
  return { ok: false, fields };
}
