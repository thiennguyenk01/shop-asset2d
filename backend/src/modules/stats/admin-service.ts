import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { effectiveOrderStatus, type OrderStatus } from "@backend/lib/payment/rules";
import {
  rangeBuckets,
  revenueSeries,
  seriesTotals,
  STATS_TOP,
  type Granularity,
  type RevenuePoint,
  type StatsRange,
} from "@backend/lib/admin/stats-rules";
import { packTextLocales } from "@backend/lib/admin/product-rules";
import { pickTranslation } from "@backend/lib/format";
import { localesFor } from "@backend/modules/product/queries";
import {
  countNewUsers,
  findAdminAttention,
  findAdminOverview,
  findPackTitles,
  findRevenueByBucket,
  findTopFreeDownloads,
  findTopSellers,
} from "./admin-repository";

/**
 * Admin overview (GĐ5.1). Revenue counts real PAID orders only — demo orders are reported apart and never
 * added to it (CLAUDE.md §6 Demo Payment). A PENDING order past its expiry counts as expired.
 * Callers must have checked Admin rights (requireAdminPage / requireAdmin).
 */
export type AdminOverview = {
  revenue: { totalVnd: number; paidOrders: number; recentVnd: number; demoVnd: number; demoOrders: number };
  orders: { total: number; pending: number; failedOrExpired: number };
  packs: { published: number; hidden: number; draft: number; total: number };
  users: { total: number; recent: number; admins: number; locked: number };
  downloads: { recent: number; total: number };
  recent: {
    code: string;
    status: OrderStatus;
    totalVnd: number;
    isDemo: boolean;
    createdAt: Date;
    buyerEmail: string;
  }[];
};

/** One written language is enough to publish; the bell lists packs still hidden in another one (DECISIONS #39). */
const LOCALES: Locale[] = ["vi", "en", "zh"];
const WINDOW_DAYS = 30;

export async function getAdminOverview(now = new Date()): Promise<AdminOverview> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const r = await findAdminOverview(now, since);
  const byStatus = (s: string) => r.statuses.find((x) => x.status === s)?._count._all ?? 0;
  const pendingAll = byStatus("PENDING");
  const packCount = (s: string) => r.packs.find((x) => x.status === s)?._count._all ?? 0;
  return {
    revenue: {
      totalVnd: r.real._sum.totalVnd ?? 0,
      paidOrders: r.real._count._all,
      recentVnd: r.realRecent._sum.totalVnd ?? 0,
      demoVnd: r.demo._sum.totalVnd ?? 0,
      demoOrders: r.demo._count._all,
    },
    orders: {
      total: r.statuses.reduce((n, x) => n + x._count._all, 0),
      pending: r.pendingLive,
      failedOrExpired: byStatus("FAILED") + byStatus("CANCELLED") + byStatus("EXPIRED") + (pendingAll - r.pendingLive),
    },
    packs: {
      published: packCount("PUBLISHED"),
      hidden: packCount("HIDDEN"),
      draft: packCount("DRAFT"),
      total: r.packs.reduce((n, x) => n + x._count._all, 0),
    },
    users: { total: r.users, recent: r.usersRecent, admins: r.admins, locked: r.locked },
    downloads: { recent: r.downloadsRecent, total: r.downloadsTotal },
    recent: r.recent.map((o) => ({
      code: o.code,
      status: effectiveOrderStatus(o, now),
      totalVnd: o.totalVnd,
      isDemo: o.isDemo,
      createdAt: o.createdAt,
      buyerEmail: o.buyerEmail,
    })),
  };
}

/**
 * What needs the Admin's attention, shown by the bell in the Admin top bar (user request 2026-11-19): live
 * PENDING orders (with the newest one's time) and packs missing a required translation. Callers must have
 * checked Admin rights.
 */
export type AdminAttention = {
  pending: { count: number; latestAt: Date | null };
  untranslated: { id: string; slug: string; title: string; missing: Locale[]; updatedAt: Date }[];
};

export async function getAdminAttention(now = new Date()): Promise<AdminAttention> {
  const r = await findAdminAttention(now, LOCALES);
  return {
    pending: { count: r.pending, latestAt: r.latestPending },
    untranslated: r.untranslated.map((p) => {
      const written = packTextLocales(p.translations);
      return {
        id: p.id,
        slug: p.slug,
        title: pickTranslation(p.translations.filter((t) => t.title.trim()), "vi")?.title ?? p.slug,
        missing: LOCALES.filter((l) => !written.includes(l)),
        updatedAt: p.updatedAt,
      };
    }),
  };
}

export type AdminStats = {
  range: StatsRange;
  granularity: Granularity;
  since: Date;
  series: RevenuePoint[];
  totals: { realVnd: number; demoVnd: number; realOrders: number; demoOrders: number; newUsers: number };
  topSellers: { id: string; slug: string; title: string; isDemoData: boolean; real: number; demo: number }[];
  topFree: { id: string; slug: string; title: string; isDemoData: boolean; downloads: number }[];
};

/**
 * Statistics page (GĐ5.7, DECISIONS #36): revenue per day / month with real and Demo money apart, best sellers,
 * most downloaded free packs, new accounts — all over one range. Callers must have checked Admin rights.
 */
export async function getAdminStats(range: StatsRange, locale: Locale, now = new Date()): Promise<AdminStats> {
  const { granularity, since, buckets } = rangeBuckets(range, now);
  const [rows, sellers, free, newUsers] = await Promise.all([
    findRevenueByBucket(since, granularity),
    findTopSellers(since, STATS_TOP),
    findTopFreeDownloads(since, STATS_TOP),
    countNewUsers(since),
  ]);
  const packs = await findPackTitles(
    [...sellers.map((s) => s.productId), ...free.map((f) => f.productId)],
    localesFor(locale),
  );
  const pack = (id: string) => {
    const p = packs.find((x) => x.id === id);
    return {
      id,
      slug: p?.slug ?? id,
      title: (p && pickTranslation(p.translations, locale)?.title) ?? p?.slug ?? id,
      isDemoData: p?.isDemoData ?? false,
    };
  };
  const series = revenueSeries(buckets, rows);
  return {
    range,
    granularity,
    since,
    series,
    totals: { ...seriesTotals(series), newUsers },
    topSellers: sellers.map((s) => ({ ...pack(s.productId), real: s.realCount, demo: s.demoCount })),
    topFree: free.map((f) => ({ ...pack(f.productId), downloads: f._count._all })),
  };
}
