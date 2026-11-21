import { normalizeCouponCode } from "@backend/lib/cart/coupon";
import { parseWholeNumber } from "./settings-rules";

/**
 * Admin coupons (GĐ5.6, DECISIONS #35), pure so they are unit-tested:
 * - the form: code, kind + value, minimum order, optional start / end (shop time, UTC+7), optional total and
 *   per-account limits, on / off;
 * - a coupon someone has used (an order carries it, or its use count is above 0) is locked: never deleted, and its
 *   code / kind / value never change. Its dates, limits and on / off still can. Orders keep their discount anyway;
 * - list filters from the URL: unknown values are ignored, never an error.
 * The database checks too: value by kind, dates in order, counts ≥ 0 (catalog migration) and a per-account limit
 * ≥ 1 (coupon_checks_dedupe). The tighter limits here (e.g. a fixed amount ≥ 1.000 ₫) are the app's.
 */
export const ADMIN_COUPONS_PAGE_SIZE = 20;
export const ADMIN_COUPON_SEARCH_MAX = 32;
export const COUPON_KINDS = ["PERCENT", "FIXED"] as const;
export const COUPON_FIXED_MIN_VND = 1_000;
export const COUPON_FIXED_MAX_VND = 100_000_000;
export const COUPON_MIN_TOTAL_MAX_VND = 1_000_000_000;
export const COUPON_USES_MAX = 1_000_000;
/** List filters (`?state=`). */
export const COUPON_FILTER_STATES = ["active", "inactive", "expired"] as const;

export type CouponKind = (typeof COUPON_KINDS)[number];
export type CouponFilterState = (typeof COUPON_FILTER_STATES)[number];
/** What the Admin sees on each coupon. */
export type CouponState = "active" | "scheduled" | "expired" | "usedUp" | "inactive";

/** The shop's clock for dates typed by the Admin: Asia/Ho_Chi_Minh, UTC+7 all year (no daylight saving). */
const SHOP_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `<input type="datetime-local">` value in shop time → the instant. Empty → null; malformed → undefined. */
export function parseShopDateTime(raw: unknown): Date | null | undefined {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const m = LOCAL_DATETIME_RE.exec(text);
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(utc);
  // Reject dates the calendar does not have (2026-02-30 would silently become March 2).
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return undefined;
  return new Date(utc - SHOP_OFFSET_MS);
}

/** The instant → a `datetime-local` value in shop time ("2026-11-19T09:30"). */
export function toShopDateTimeInput(date: Date | null): string {
  return date ? new Date(date.getTime() + SHOP_OFFSET_MS).toISOString().slice(0, 16) : "";
}

export function couponState(
  c: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; maxUses: number | null; usedCount: number },
  now: Date,
): CouponState {
  if (!c.isActive) return "inactive";
  if (c.endsAt && now >= c.endsAt) return "expired";
  if (c.startsAt && now < c.startsAt) return "scheduled";
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return "usedUp";
  return "active";
}

/** Used = some order carries the coupon (paid, pending, expired, refunded…) or its use count is above 0. */
export function couponUsed(c: { usedCount: number; orderCount: number }): boolean {
  return c.usedCount > 0 || c.orderCount > 0;
}

export type CouponInput = {
  code: string;
  kind: CouponKind;
  value: number;
  minTotalVnd: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  isActive: boolean;
};

export type CouponField = Exclude<keyof CouponInput, "isActive">;
export type CouponFieldError =
  "required" | "codeFormat" | "notWhole" | "percentRange" | "fixedRange" | "outOfRange" | "badDate" | "endBeforeStart";

export type CouponFormRaw = Partial<Record<keyof CouponInput, unknown>>;

function wholeIn(raw: unknown, min: number, max: number, optional: boolean, money = false) {
  const n = parseWholeNumber(raw, money);
  if (n === null) return optional ? { ok: true as const, n: null } : { ok: false as const, error: "required" as const };
  if (!Number.isSafeInteger(n)) return { ok: false as const, error: "notWhole" as const };
  if (n < min || n > max) return { ok: false as const, error: "outOfRange" as const };
  return { ok: true as const, n };
}

export function parseCouponForm(
  raw: CouponFormRaw,
): { ok: true; value: CouponInput } | { ok: false; fields: Partial<Record<CouponField, CouponFieldError>> } {
  const fields: Partial<Record<CouponField, CouponFieldError>> = {};

  const code = normalizeCouponCode(raw.code);
  if (!code) fields.code = typeof raw.code === "string" && raw.code.trim() ? "codeFormat" : "required";

  const kind = COUPON_KINDS.find((k) => k === raw.kind) ?? "PERCENT";
  const value = parseWholeNumber(raw.value, kind === "FIXED"); // a percentage takes digits only
  if (value === null) fields.value = "required";
  else if (!Number.isSafeInteger(value)) fields.value = "notWhole";
  else if (kind === "PERCENT" && (value < 1 || value > 100)) fields.value = "percentRange";
  else if (kind === "FIXED" && (value < COUPON_FIXED_MIN_VND || value > COUPON_FIXED_MAX_VND))
    fields.value = "fixedRange";

  const minTotal = wholeIn(raw.minTotalVnd, 0, COUPON_MIN_TOTAL_MAX_VND, true, true);
  if (!minTotal.ok) fields.minTotalVnd = minTotal.error;
  const maxUses = wholeIn(raw.maxUses, 1, COUPON_USES_MAX, true);
  if (!maxUses.ok) fields.maxUses = maxUses.error;
  const perUser = wholeIn(raw.maxUsesPerUser, 1, COUPON_USES_MAX, true);
  if (!perUser.ok) fields.maxUsesPerUser = perUser.error;

  const startsAt = parseShopDateTime(raw.startsAt);
  if (startsAt === undefined) fields.startsAt = "badDate";
  const endsAt = parseShopDateTime(raw.endsAt);
  if (endsAt === undefined) fields.endsAt = "badDate";
  else if (startsAt && endsAt && endsAt <= startsAt) fields.endsAt = "endBeforeStart";

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: {
      code: code!,
      kind,
      value: value!,
      minTotalVnd: minTotal.ok ? (minTotal.n ?? 0) : 0,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      maxUses: maxUses.ok ? maxUses.n : null,
      maxUsesPerUser: perUser.ok ? perUser.n : null,
      isActive: raw.isActive === true || raw.isActive === "on",
    },
  };
}

/** A used coupon keeps its code, kind and value (DECISIONS #35). Returns the fields that would change. */
export function lockedChanges(
  current: { code: string; kind: CouponKind; value: number },
  next: { code: string; kind: CouponKind; value: number },
): ("code" | "kind" | "value")[] {
  return (["code", "kind", "value"] as const).filter((k) => current[k] !== next[k]);
}

export type AdminCouponFilters = { q: string; state: CouponFilterState | undefined; page: number };

export function parseAdminCouponFilters(raw: { q?: string; state?: string; page?: string }): AdminCouponFilters {
  const q = (raw.q ?? "").trim().toUpperCase().slice(0, ADMIN_COUPON_SEARCH_MAX);
  const state = COUPON_FILTER_STATES.find((s) => s === raw.state);
  const n = Number(raw.page ?? 1);
  return { q, state, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
}
