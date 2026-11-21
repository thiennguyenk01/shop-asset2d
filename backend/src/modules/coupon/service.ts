import "server-only";
import { checkCoupon, normalizeCouponCode, type CouponCheck } from "@backend/lib/cart/coupon";
import { getDb } from "@backend/db";

/**
 * Check a coupon code against a payable subtotal right now. Read-only: a coupon's use is only counted
 * when an order is paid (Phase 4). Unknown / malformed codes give the same "invalid" answer.
 * With `userId`, the per-account limit (DECISIONS #35) counts this account's paid uses plus its pending orders
 * that have not expired, so a customer cannot open several pending orders to get past the limit.
 */
export async function checkCouponCode(
  rawCode: unknown,
  subtotalVnd: number,
  now = new Date(),
  userId: string | null = null,
): Promise<CouponCheck> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, code: null, problem: "invalid" };
  const coupon = await getDb().coupon.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      kind: true,
      value: true,
      minTotalVnd: true,
      startsAt: true,
      endsAt: true,
      maxUses: true,
      maxUsesPerUser: true,
      usedCount: true,
      isActive: true,
    },
  });
  const userUses =
    coupon && userId && coupon.maxUsesPerUser !== null ? await countUserUses(coupon.id, userId, now) : null;
  return checkCoupon(coupon, subtotalVnd, now, userUses);
}

async function countUserUses(couponId: string, userId: string, now: Date): Promise<number> {
  const [paid, pending] = await Promise.all([
    getDb().couponRedemption.count({ where: { couponId, userId } }),
    getDb().order.count({ where: { couponId, userId, status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  return paid + pending;
}
