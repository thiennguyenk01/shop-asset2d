import "server-only";
import { getDb } from "@backend/db";

/** PENDING orders that ran out before `before`, oldest first, with their latest payment (reconcile job). */
export function findOverduePendingOrders(before: Date, take: number) {
  return getDb().order.findMany({
    where: { status: "PENDING", expiresAt: { lte: before } },
    orderBy: { expiresAt: "asc" },
    take,
    select: {
      id: true,
      code: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, providerTxnId: true, status: true } },
    },
  });
}

/** These orders → EXPIRED, conditional on PENDING: a payment settled meanwhile wins. */
export async function markOrdersExpired(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await getDb().order.updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: { status: "EXPIRED" } });
  return count;
}

/**
 * Guest carts (no account) with no change since `cutoff`: neither the cart nor any of its lines. Lines cascade.
 * A signed-in shopper's cart is never touched.
 */
export async function deleteStaleGuestCarts(cutoff: Date): Promise<number> {
  const { count } = await getDb().cart.deleteMany({
    where: {
      userId: null,
      updatedAt: { lt: cutoff },
      items: { none: { updatedAt: { gte: cutoff } } },
    },
  });
  return count;
}

/** Of these storage keys, the ones a media or file row still refers to. */
export async function findReferencedKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const [media, files] = await Promise.all([
    getDb().productMedia.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
    getDb().productFile.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
  ]);
  return new Set([...media, ...files].map((r) => r.storageKey));
}
