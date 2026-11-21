/**
 * Demo coupons (CLAUDE.md §11: demo data is clearly marked). Every code starts with "DEMO" so nobody mistakes
 * them for real offers; real coupons are created by the Admin in Phase 5. Upserted by code (idempotent).
 * Each one exercises one rule of backend/src/lib/cart/coupon.ts.
 */
export type CouponSeed = {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minTotalVnd?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxUses?: number | null;
  usedCount?: number;
};

export const DEMO_COUPONS: CouponSeed[] = [
  { code: "DEMO10", kind: "PERCENT", value: 10 }, // 10%, no minimum
  { code: "DEMO200K", kind: "FIXED", value: 200_000, minTotalVnd: 1_000_000 }, // −200.000 ₫ from 1.000.000 ₫
  { code: "DEMOHETHAN", kind: "PERCENT", value: 20, startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-02-01T00:00:00Z") }, // expired
  { code: "DEMOHETLUOT", kind: "FIXED", value: 100_000, maxUses: 1, usedCount: 1 }, // used up
];
