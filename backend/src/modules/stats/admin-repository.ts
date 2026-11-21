import "server-only";
import type { Locale } from "@backend/generated/prisma/client";
import { getDb } from "@backend/db";
import { writtenIn } from "@backend/modules/product/queries";

/** Store-wide numbers for the Admin overview (one round of parallel queries). */
export async function findAdminOverview(now: Date, since: Date) {
  const db = getDb();
  const [
    real,
    realRecent,
    demo,
    statuses,
    pendingLive,
    packs,
    users,
    usersRecent,
    admins,
    locked,
    downloadsRecent,
    downloadsTotal,
    recent,
  ] = await Promise.all([
    db.order.aggregate({ where: { status: "PAID", isDemo: false }, _sum: { totalVnd: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { status: "PAID", isDemo: false, paidAt: { gte: since } }, _sum: { totalVnd: true } }),
    db.order.aggregate({ where: { status: "PAID", isDemo: true }, _sum: { totalVnd: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.count({ where: { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    db.product.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.user.count({ where: { role: "ADMIN" } }),
    db.user.count({ where: { status: "LOCKED" } }),
    db.downloadLog.count({ where: { createdAt: { gte: since } } }),
    db.downloadLog.count(),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        code: true,
        status: true,
        expiresAt: true,
        totalVnd: true,
        isDemo: true,
        createdAt: true,
        buyerEmail: true,
      },
    }),
  ]);
  return {
    real,
    realRecent,
    demo,
    statuses,
    pendingLive,
    packs,
    users,
    usersRecent,
    admins,
    locked,
    downloadsRecent,
    downloadsTotal,
    recent,
  };
}

/**
 * What needs the Admin's attention (the bell in the Admin top bar): live PENDING orders and packs whose texts are
 * not written in every language yet (the storefront hides a pack in such a language, DECISIONS #39).
 */
export async function findAdminAttention(now: Date, locales: Locale[]) {
  const db = getDb();
  const live = { status: "PENDING" as const, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [pending, latestPending, untranslated] = await Promise.all([
    db.order.count({ where: live }),
    db.order.findFirst({ where: live, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.product.findMany({
      where: { OR: locales.map((locale) => ({ NOT: writtenIn(locale) })) },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        translations: { select: { locale: true, title: true, shortDescription: true, description: true } },
      },
    }),
  ]);
  return { pending, latestPending: latestPending?.createdAt ?? null, untranslated };
}

/*
 * Statistics page (GĐ5.7, DECISIONS #36). Money is counted on PAID orders by the day (or month) they were paid,
 * in shop time (Asia/Ho_Chi_Minh); a refunded order is REFUNDED, so it leaves the figures. Real and Demo money
 * come back as separate rows and are never added together.
 */
type RevenueSqlRow = { bucket: string; isDemo: boolean; totalVnd: bigint | null; orders: number };

export async function findRevenueByBucket(since: Date, granularity: "day" | "month") {
  const pattern = granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  // "paidAt" is stored as UTC without a zone: read it as UTC, then show it in shop time.
  const rows = await getDb().$queryRaw<RevenueSqlRow[]>`
    SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh', ${pattern}) AS bucket,
           "isDemo",
           SUM("totalVnd")::bigint AS "totalVnd",
           COUNT(*)::int AS orders
    FROM "Order"
    WHERE status = 'PAID' AND "paidAt" >= ${since}
    GROUP BY 1, 2`;
  return rows.map((r) => ({ bucket: r.bucket, isDemo: r.isDemo, totalVnd: Number(r.totalVnd ?? 0), orders: r.orders }));
}

type TopSellerSqlRow = { productId: string; realCount: number; demoCount: number };

/** Packs sold most in PAID orders since `since` (pack lines only, not "more downloads"); real and Demo apart. */
export async function findTopSellers(since: Date, take: number) {
  return getDb().$queryRaw<TopSellerSqlRow[]>`
    SELECT oi."productId",
           COUNT(*) FILTER (WHERE NOT o."isDemo")::int AS "realCount",
           COUNT(*) FILTER (WHERE o."isDemo")::int AS "demoCount"
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE oi.kind = 'PACK' AND o.status = 'PAID' AND o."paidAt" >= ${since}
    GROUP BY oi."productId"
    ORDER BY COUNT(*) DESC, oi."productId"
    LIMIT ${take}`;
}

/** Free packs downloaded most since `since`. */
export function findTopFreeDownloads(since: Date, take: number) {
  return getDb().downloadLog.groupBy({
    by: ["productId"],
    where: { createdAt: { gte: since }, product: { type: "FREE" } },
    _count: { _all: true },
    orderBy: [{ _count: { productId: "desc" } }, { productId: "asc" }],
    take,
  });
}

export function countNewUsers(since: Date) {
  return getDb().user.count({ where: { createdAt: { gte: since } } });
}

/** Titles (with the VI fallback) of the packs in the top lists. */
export function findPackTitles(ids: string[], locales: Locale[]) {
  return getDb().product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      type: true,
      isDemoData: true,
      translations: { where: { locale: { in: locales } }, select: { locale: true, title: true } },
    },
  });
}
