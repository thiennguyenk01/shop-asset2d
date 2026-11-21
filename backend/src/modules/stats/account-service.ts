import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { pickTranslation } from "@backend/lib/format";
import { effectiveOrderStatus, type OrderStatus } from "@backend/lib/payment/rules";
import {
  countDownloads,
  countEntitlementsBySource,
  countExpiredPending,
  countOrdersByStatus,
  memberSince,
  recentOrders,
  sumPaidOrders,
  topDownloadedPacks,
} from "./account-repository";

/**
 * A customer's own statistics (their library, downloads, orders and spending). Only ever for the signed-in
 * user's id; demo orders are reported apart and never counted as money spent (CLAUDE.md §6).
 */
export const STATS_DAYS = 30;
const TOP_PACKS = 5;
/** "Recent orders" on the stats page (user request 2026-11-20: only the last 3; the full list is /orders). */
export const RECENT_ORDERS = 3;

export type AccountStats = {
  memberSince: Date | null;
  library: { total: number; free: number; purchased: number; gifted: number };
  downloads: { total: number; recent: number; topPacks: { slug: string; title: string; count: number }[] };
  spending: { realVnd: number; realOrders: number; demoVnd: number; demoOrders: number; couponSavingsVnd: number; demoCouponSavingsVnd: number };
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    recent: { code: string; createdAt: Date; status: OrderStatus; totalVnd: number; isDemo: boolean; itemCount: number; extraDownloads: number | null }[];
  };
};

export async function getAccountStats(userId: string, locale: Locale, now = new Date()): Promise<AccountStats> {
  const since = new Date(now.getTime() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const [joined, sources, totalDownloads, recentDownloads, top, paid, statuses, expiredPending, recent] = await Promise.all([
    memberSince(userId),
    countEntitlementsBySource(userId),
    countDownloads(userId),
    countDownloads(userId, since),
    topDownloadedPacks(userId, locale, TOP_PACKS),
    sumPaidOrders(userId),
    countOrdersByStatus(userId),
    countExpiredPending(userId, now),
    recentOrders(userId, RECENT_ORDERS),
  ]);

  const bySource = (s: string) => sources.find((r) => r.source === s)?._count._all ?? 0;
  const real = paid.find((r) => !r.isDemo);
  const demo = paid.find((r) => r.isDemo);

  const byStatus: Record<OrderStatus, number> = { PENDING: 0, PAID: 0, FAILED: 0, CANCELLED: 0, EXPIRED: 0, REFUNDED: 0 };
  for (const r of statuses) byStatus[r.status] = r._count._all;
  byStatus.PENDING -= expiredPending;
  byStatus.EXPIRED += expiredPending;

  return {
    memberSince: joined?.createdAt ?? null,
    library: {
      free: bySource("FREE_CLAIM"),
      purchased: bySource("PURCHASE"),
      gifted: bySource("ADMIN_GRANT"),
      total: sources.reduce((n, r) => n + r._count._all, 0),
    },
    downloads: {
      total: totalDownloads,
      recent: recentDownloads,
      topPacks: top.map((t) => ({ slug: t.product.slug, title: pickTranslation(t.product.translations, locale)?.title ?? t.product.slug, count: t.count })),
    },
    spending: {
      realVnd: real?._sum.totalVnd ?? 0,
      realOrders: real?._count._all ?? 0,
      demoVnd: demo?._sum.totalVnd ?? 0,
      demoOrders: demo?._count._all ?? 0,
      couponSavingsVnd: real?._sum.discountVnd ?? 0,
      demoCouponSavingsVnd: demo?._sum.discountVnd ?? 0,
    },
    orders: {
      total: statuses.reduce((n, r) => n + r._count._all, 0),
      byStatus,
      recent: recent.map((o) => ({
        code: o.code,
        createdAt: o.createdAt,
        status: effectiveOrderStatus(o, now),
        totalVnd: o.totalVnd,
        isDemo: o.isDemo,
        itemCount: o._count.items,
        // A "more downloads" order (step 4.6) shows the downloads it added instead of a pack count.
        extraDownloads: o.items.every((i) => i.kind === "EXTRA_DOWNLOADS") ? o.items.reduce((n, i) => n + (i.extraDownloads ?? 0), 0) : null,
      })),
    },
  };
}
