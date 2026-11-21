/**
 * Coupon rules (CLAUDE.md §4–§6), pure so they are unit-tested and reused by checkout in Phase 4.
 * A coupon is only ever *checked* here; its use is counted when an order is paid (Phase 4 webhook,
 * CouponRedemption + usedCount in the same transaction). Money is integer VND.
 */
export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** Codes are case-insensitive for people: "demo10 " and "DEMO10" are the same code. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return COUPON_CODE_RE.test(code) ? code : null;
}

export type CouponRow = {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minTotalVnd: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  /** Uses allowed per account (DECISIONS #35); null = no limit. */
  maxUsesPerUser: number | null;
  usedCount: number;
  isActive: boolean;
};

export type CouponProblem = "invalid" | "notStarted" | "expired" | "usedUp" | "perUserLimit" | "minTotal" | "emptyCart";

export type CouponCheck =
  | { ok: true; code: string; kind: CouponRow["kind"]; value: number; discountVnd: number }
  | { ok: false; code: string | null; problem: CouponProblem; minTotalVnd?: number };

/** Discount for a payable subtotal: percent rounds down to whole đồng; never more than the subtotal. */
export function couponDiscount(kind: CouponRow["kind"], value: number, subtotalVnd: number): number {
  const raw = kind === "PERCENT" ? Math.floor((subtotalVnd * value) / 100) : value;
  return Math.max(0, Math.min(raw, subtotalVnd));
}

/**
 * `userUses`: how many times this account has used the coupon (paid orders + unexpired pending ones), or null when
 * nobody is signed in — then the per-account limit is checked later, at checkout (which needs an account).
 */
export function checkCoupon(
  coupon: CouponRow | null,
  subtotalVnd: number,
  now: Date,
  userUses: number | null = null,
): CouponCheck {
  if (!coupon || !coupon.isActive) return { ok: false, code: coupon?.code ?? null, problem: "invalid" };
  const { code } = coupon;
  if (coupon.startsAt && now < coupon.startsAt) return { ok: false, code, problem: "notStarted" };
  if (coupon.endsAt && now >= coupon.endsAt) return { ok: false, code, problem: "expired" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, code, problem: "usedUp" };
  if (coupon.maxUsesPerUser !== null && userUses !== null && userUses >= coupon.maxUsesPerUser)
    return { ok: false, code, problem: "perUserLimit" };
  if (subtotalVnd <= 0) return { ok: false, code, problem: "emptyCart" };
  if (subtotalVnd < coupon.minTotalVnd)
    return { ok: false, code, problem: "minTotal", minTotalVnd: coupon.minTotalVnd };
  return {
    ok: true,
    code,
    kind: coupon.kind,
    value: coupon.value,
    discountVnd: couponDiscount(coupon.kind, coupon.value, subtotalVnd),
  };
}
