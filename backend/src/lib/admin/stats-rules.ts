/**
 * Admin statistics (GĐ5.7, DECISIONS #36), pure so they are unit-tested: the time ranges, their buckets (days or
 * months, in shop time UTC+7) and the revenue series with real and Demo money kept apart.
 */
export const STATS_RANGES = ["7d", "30d", "12m"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const DEFAULT_STATS_RANGE: StatsRange = "30d";
export const STATS_TOP = 10;

/** Asia/Ho_Chi_Minh: UTC+7 all year (no daylight saving). */
const SHOP_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseStatsRange(raw: unknown): StatsRange {
  return STATS_RANGES.find((r) => r === raw) ?? DEFAULT_STATS_RANGE;
}

export type Granularity = "day" | "month";
export type Bucket = { key: string; start: Date; end: Date };

/** "2026-11-19" (day) or "2026-11" (month) of an instant, in shop time. */
export function bucketKey(at: Date, granularity: Granularity): string {
  const local = new Date(at.getTime() + SHOP_OFFSET_MS).toISOString();
  return granularity === "day" ? local.slice(0, 10) : local.slice(0, 7);
}

/** Midnight (shop time) of the shop day that contains `at`, as an instant. */
function shopDayStart(at: Date): Date {
  const local = new Date(at.getTime() + SHOP_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHOP_OFFSET_MS);
}

/**
 * The buckets of a range, oldest first, the last one containing `now`: 7 or 30 shop days, or 12 shop months.
 * `since` (the first bucket's start) is where the queries begin.
 */
export function rangeBuckets(
  range: StatsRange,
  now: Date,
): { granularity: Granularity; since: Date; buckets: Bucket[] } {
  if (range === "12m") {
    const local = new Date(now.getTime() + SHOP_OFFSET_MS);
    const buckets: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1) - SHOP_OFFSET_MS);
      const end = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i + 1, 1) - SHOP_OFFSET_MS);
      buckets.push({ key: bucketKey(start, "month"), start, end });
    }
    return { granularity: "month", since: buckets[0].start, buckets };
  }
  const days = range === "7d" ? 7 : 30;
  const today = shopDayStart(now);
  const buckets: Bucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today.getTime() - i * DAY_MS);
    buckets.push({ key: bucketKey(start, "day"), start, end: new Date(start.getTime() + DAY_MS) });
  }
  return { granularity: "day", since: buckets[0].start, buckets };
}

export type RevenueRow = { bucket: string; isDemo: boolean; totalVnd: number; orders: number };
export type RevenuePoint = {
  key: string;
  start: Date;
  realVnd: number;
  demoVnd: number;
  realOrders: number;
  demoOrders: number;
};

/** Fill every bucket (0 where nothing was paid); real and Demo money never added together. */
export function revenueSeries(buckets: Bucket[], rows: RevenueRow[]): RevenuePoint[] {
  const points = new Map(
    buckets.map((b) => [b.key, { key: b.key, start: b.start, realVnd: 0, demoVnd: 0, realOrders: 0, demoOrders: 0 }]),
  );
  for (const r of rows) {
    const p = points.get(r.bucket);
    if (!p) continue; // outside the range (e.g. a clock edge): ignored, never misfiled
    if (r.isDemo) {
      p.demoVnd += r.totalVnd;
      p.demoOrders += r.orders;
    } else {
      p.realVnd += r.totalVnd;
      p.realOrders += r.orders;
    }
  }
  return [...points.values()];
}

export function seriesTotals(points: RevenuePoint[]) {
  return points.reduce(
    (t, p) => ({
      realVnd: t.realVnd + p.realVnd,
      demoVnd: t.demoVnd + p.demoVnd,
      realOrders: t.realOrders + p.realOrders,
      demoOrders: t.demoOrders + p.demoOrders,
    }),
    { realVnd: 0, demoVnd: 0, realOrders: 0, demoOrders: 0 },
  );
}

/**
 * A "nice" top of the axis (1, 2, 2.5 or 5 × 10ⁿ, at least the largest value) and its 4 equal steps, so the
 * gridlines read as round numbers. 0 → [0] (an empty chart still draws its baseline).
 */
export function niceAxis(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= max)!;
  return [0, step, step * 2, step * 3, step * 4];
}
