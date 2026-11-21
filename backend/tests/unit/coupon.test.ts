import { describe, expect, it } from "vitest";
import { checkCoupon, couponDiscount, normalizeCouponCode, type CouponRow } from "@backend/lib/cart/coupon";

const now = new Date("2026-11-14T12:00:00Z");
const base: CouponRow = {
  code: "DEMO10",
  kind: "PERCENT",
  value: 10,
  minTotalVnd: 0,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  maxUsesPerUser: null,
  usedCount: 0,
  isActive: true,
};

describe("normalizeCouponCode", () => {
  it("trims, upper-cases and rejects odd input", () => {
    expect(normalizeCouponCode("  demo10 ")).toBe("DEMO10");
    expect(normalizeCouponCode("ab")).toBeNull();
    expect(normalizeCouponCode("có dấu")).toBeNull();
    expect(normalizeCouponCode("x".repeat(33))).toBeNull();
    expect(normalizeCouponCode(42)).toBeNull();
  });
});

describe("couponDiscount", () => {
  it("percent rounds down to whole đồng, fixed never exceeds the subtotal", () => {
    expect(couponDiscount("PERCENT", 10, 1_490_000)).toBe(149_000);
    expect(couponDiscount("PERCENT", 15, 999_999)).toBe(149_999);
    expect(couponDiscount("PERCENT", 100, 690_000)).toBe(690_000);
    expect(couponDiscount("FIXED", 200_000, 1_290_000)).toBe(200_000);
    expect(couponDiscount("FIXED", 2_000_000, 690_000)).toBe(690_000);
  });
});

describe("checkCoupon", () => {
  it("accepts a valid coupon and returns the discount", () => {
    expect(checkCoupon(base, 2_780_000, now)).toEqual({
      ok: true,
      code: "DEMO10",
      kind: "PERCENT",
      value: 10,
      discountVnd: 278_000,
    });
  });

  it("explains why a coupon cannot be used", () => {
    expect(checkCoupon(null, 1_000_000, now)).toMatchObject({ ok: false, problem: "invalid" });
    expect(checkCoupon({ ...base, isActive: false }, 1_000_000, now)).toMatchObject({ ok: false, problem: "invalid" });
    expect(checkCoupon({ ...base, startsAt: new Date("2026-12-01") }, 1_000_000, now)).toMatchObject({
      problem: "notStarted",
    });
    expect(checkCoupon({ ...base, endsAt: new Date("2026-11-01") }, 1_000_000, now)).toMatchObject({
      problem: "expired",
    });
    expect(checkCoupon({ ...base, endsAt: now }, 1_000_000, now)).toMatchObject({ problem: "expired" }); // end is exclusive
    expect(checkCoupon({ ...base, maxUses: 5, usedCount: 5 }, 1_000_000, now)).toMatchObject({ problem: "usedUp" });
    expect(checkCoupon(base, 0, now)).toMatchObject({ problem: "emptyCart" });
    // Per-account limit (DECISIONS #35): only checked when the account is known (userUses not null).
    const once = { ...base, maxUsesPerUser: 1 };
    expect(checkCoupon(once, 1_000_000, now, 1)).toMatchObject({ ok: false, problem: "perUserLimit" });
    expect(checkCoupon(once, 1_000_000, now, 0)).toMatchObject({ ok: true });
    expect(checkCoupon(once, 1_000_000, now)).toMatchObject({ ok: true }); // guest: checked at checkout
    expect(checkCoupon(base, 1_000_000, now, 99)).toMatchObject({ ok: true }); // no per-account limit
    expect(checkCoupon({ ...base, minTotalVnd: 1_000_000 }, 690_000, now)).toEqual({
      ok: false,
      code: "DEMO10",
      problem: "minTotal",
      minTotalVnd: 1_000_000,
    });
  });
});
