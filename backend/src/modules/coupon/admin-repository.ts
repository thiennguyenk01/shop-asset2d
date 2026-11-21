import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { couponUsed, lockedChanges, type CouponFilterState, type CouponInput } from "@backend/lib/admin/coupon-rules";
import { getDb } from "@backend/db";

/**
 * Admin coupons (GĐ5.6, DECISIONS #35). Every write runs in one transaction with its AuditLog row and re-reads
 * the coupon there, so "used → locked" holds even if an order arrives between the page load and the save.
 */
type Tx = Prisma.TransactionClient;
const audit = (tx: Tx, adminId: string, action: string, entityId: string, diff: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { adminId, action, entity: "Coupon", entityId, diff } });

const LIST_SELECT = {
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
  createdAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.CouponSelect;

export function findAdminCouponsPage(
  filters: { q: string; state?: CouponFilterState },
  now: Date,
  skip: number,
  take: number,
) {
  const and: Prisma.CouponWhereInput[] = [];
  if (filters.q) and.push({ code: { contains: filters.q, mode: "insensitive" } });
  if (filters.state === "active") and.push({ isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] });
  if (filters.state === "inactive") and.push({ isActive: false });
  if (filters.state === "expired") and.push({ endsAt: { lte: now } });
  const where: Prisma.CouponWhereInput = { AND: and };
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().coupon.count({ where }),
    getDb().coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: LIST_SELECT }),
  ]);
}

/** One coupon with its latest orders (any status: who used it, or is about to). */
export function findAdminCoupon(id: string) {
  return getDb().coupon.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      updatedAt: true,
      _count: { select: { orders: true, redemptions: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          code: true,
          status: true,
          expiresAt: true,
          totalVnd: true,
          discountVnd: true,
          isDemo: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      },
    },
  });
}

const toData = (v: CouponInput) => ({
  code: v.code,
  kind: v.kind,
  value: v.value,
  minTotalVnd: v.minTotalVnd,
  startsAt: v.startsAt,
  endsAt: v.endsAt,
  maxUses: v.maxUses,
  maxUsesPerUser: v.maxUsesPerUser,
  isActive: v.isActive,
});

/** JSON-safe snapshot for the AuditLog diff. */
const snapshot = (c: ReturnType<typeof toData>) => ({
  ...c,
  startsAt: c.startsAt?.toISOString() ?? null,
  endsAt: c.endsAt?.toISOString() ?? null,
});

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createCouponRows(
  value: CouponInput,
  adminId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: "codeTaken" }> {
  try {
    return await getDb().$transaction(async (tx) => {
      const c = await tx.coupon.create({ data: toData(value), select: { id: true } });
      await audit(tx, adminId, "coupon.create", c.id, { after: snapshot(toData(value)) });
      return { ok: true as const, id: c.id };
    });
  } catch (e) {
    if (isUniqueClash(e)) return { ok: false, error: "codeTaken" };
    throw e;
  }
}

export type UpdateCouponRowsResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: "notFound" | "codeTaken" | "locked"; fields?: ("code" | "kind" | "value")[] };

export async function updateCouponRows(
  id: string,
  value: CouponInput,
  adminId: string,
): Promise<UpdateCouponRowsResult> {
  try {
    return await getDb().$transaction(async (tx) => {
      const current = await tx.coupon.findUnique({
        where: { id },
        select: { ...LIST_SELECT, _count: { select: { orders: true } } },
      });
      if (!current) return { ok: false as const, error: "notFound" as const };
      if (couponUsed({ usedCount: current.usedCount, orderCount: current._count.orders })) {
        const fields = lockedChanges(current, value);
        if (fields.length > 0) return { ok: false as const, error: "locked" as const, fields };
      }
      const before = toData({ ...current });
      const after = toData(value);
      const same = JSON.stringify(snapshot(before)) === JSON.stringify(snapshot(after));
      if (same) return { ok: true as const, changed: false };
      await tx.coupon.update({ where: { id }, data: after });
      await audit(tx, adminId, "coupon.update", id, { before: snapshot(before), after: snapshot(after) });
      return { ok: true as const, changed: true };
    });
  } catch (e) {
    if (isUniqueClash(e)) return { ok: false, error: "codeTaken" };
    throw e;
  }
}

/** Delete a coupon nobody has used. The order count is re-read inside the transaction. */
export function deleteCouponRows(
  id: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "used" }> {
  return getDb().$transaction(async (tx) => {
    const c = await tx.coupon.findUnique({
      where: { id },
      select: { code: true, usedCount: true, _count: { select: { orders: true, redemptions: true } } },
    });
    if (!c) return { ok: false as const, error: "notFound" as const };
    if (couponUsed({ usedCount: c.usedCount, orderCount: c._count.orders }) || c._count.redemptions > 0)
      return { ok: false as const, error: "used" as const };
    await tx.coupon.delete({ where: { id } });
    await audit(tx, adminId, "coupon.delete", id, { code: c.code });
    return { ok: true as const };
  });
}
