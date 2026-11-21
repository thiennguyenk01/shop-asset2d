import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getDb } from "@backend/db";
import { localesFor } from "@backend/modules/product/queries";

/** Read-only queries behind a customer's own statistics page. Every query is scoped to ONE userId. */

export function countEntitlementsBySource(userId: string) {
  return getDb().entitlement.groupBy({ by: ["source"], where: { userId, revokedAt: null }, _count: { _all: true } });
}

export function countDownloads(userId: string, since?: Date) {
  return getDb().downloadLog.count({ where: { userId, ...(since ? { createdAt: { gte: since } } : {}) } });
}

export async function topDownloadedPacks(userId: string, locale: Locale, take: number) {
  const rows = await getDb().downloadLog.groupBy({
    by: ["productId"],
    where: { userId },
    _count: { _all: true },
    orderBy: { _count: { productId: "desc" } },
    take,
  });
  if (rows.length === 0) return [];
  const products = await getDb().product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, slug: true, translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(r.productId);
    return p ? [{ product: p, count: r._count._all }] : [];
  });
}

/** Paid totals, split by real / demo (a demo order never counts as money spent). */
export function sumPaidOrders(userId: string) {
  return getDb().order.groupBy({
    by: ["isDemo"],
    where: { userId, status: "PAID" },
    _sum: { totalVnd: true, discountVnd: true },
    _count: { _all: true },
  });
}

export function countOrdersByStatus(userId: string) {
  return getDb().order.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } });
}

/** PENDING orders already past their expiry — shown as expired (CLAUDE.md §6, read lazily). */
export function countExpiredPending(userId: string, now: Date) {
  return getDb().order.count({ where: { userId, status: "PENDING", expiresAt: { lte: now } } });
}

export function recentOrders(userId: string, take: number) {
  return getDb().order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { code: true, status: true, expiresAt: true, totalVnd: true, isDemo: true, createdAt: true, _count: { select: { items: true } }, items: { select: { kind: true, extraDownloads: true } } },
  });
}

export function memberSince(userId: string) {
  return getDb().user.findUnique({ where: { id: userId }, select: { createdAt: true } });
}
