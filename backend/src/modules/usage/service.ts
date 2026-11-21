import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getEnv } from "@backend/env";
import { emailWindows, FREE_LIMITS, usageLevel, usagePercent, worstLevel, type UsageKey, type UsageLevel } from "@backend/lib/usage/rules";
import { getStorage, type Bucket } from "@backend/storage";
import { countMailsSince, databaseBytes, largestTables } from "./repository";

export const USAGE_TAG = "usage";

export type UsageItem = { key: UsageKey; used: number; limit: number; percent: number; level: UsageLevel };
export type UsageReport = {
  /** A measure that could not be read (the service did not answer) is missing here and listed in `failed`. */
  items: UsageItem[];
  failed: UsageKey[];
  buckets: Partial<Record<Bucket, { objects: number; bytes: number }>>;
  tables: { name: string; bytes: number }[];
  worst: UsageLevel;
  measuredAt: Date;
  storageDriver: "local" | "r2";
  mailDriver: string;
};

const item = (key: UsageKey, used: number): UsageItem => {
  const { limit } = FREE_LIMITS[key];
  return { key, used, limit, percent: usagePercent(used, limit), level: usageLevel(used, limit) };
};

/**
 * Admin "Usage" (user choice 2026-11-22): what can be read without extra tokens: database size, the two buckets
 * of this environment, mails sent. Kept 10 minutes (listing a bucket costs one Class A operation per 1,000 keys);
 * the page's "Refresh" button clears it (USAGE_TAG).
 */
export async function getUsageReport(): Promise<UsageReport> {
  "use cache";
  cacheTag(USAGE_TAG);
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  const now = new Date();
  const windows = emailWindows(now);
  const storage = getStorage();
  const settle = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), () => ({ ok: false as const }));
  const [db, tables, pub, priv, day, month] = await Promise.all([
    settle(databaseBytes()),
    settle(largestTables(5)),
    settle(storage.usage("public")),
    settle(storage.usage("private")),
    settle(countMailsSince(windows.day)),
    settle(countMailsSince(windows.month)),
  ]);

  const items: UsageItem[] = [];
  const failed: UsageKey[] = [];
  const add = (key: UsageKey, r: { ok: true; v: number } | { ok: false }) => (r.ok ? items.push(item(key, r.v)) : failed.push(key));
  add("database", db);
  add("storage", pub.ok && priv.ok ? { ok: true, v: pub.v.bytes + priv.v.bytes } : { ok: false });
  add("emailDay", day);
  add("emailMonth", month);

  const env = getEnv();
  return {
    items,
    failed,
    buckets: { ...(pub.ok ? { public: pub.v } : {}), ...(priv.ok ? { private: priv.v } : {}) },
    tables: tables.ok ? tables.v : [],
    worst: worstLevel(items.map((i) => i.level)),
    measuredAt: now,
    storageDriver: storage.driver,
    mailDriver: env.MAIL_DRIVER,
  };
}
