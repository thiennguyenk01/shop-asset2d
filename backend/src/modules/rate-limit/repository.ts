import "server-only";
import { getDb } from "@backend/db";

/** Rate-limit counters (GĐ7.1). Keys are already hashed (lib/rate-limit/rules.ts). */
export function findRateRows(keys: string[]) {
  if (keys.length === 0) return Promise.resolve([]);
  return getDb().rateLimit.findMany({ where: { key: { in: keys } }, select: { key: true, count: true, windowStart: true } });
}

/**
 * One more failure for `key`, atomically (one statement, so concurrent requests cannot lose a count): a new row
 * starts at 1; a row whose window is over starts again at 1 with a new window; otherwise count + 1.
 */
export async function addFailure(key: string, windowMs: number, now: Date): Promise<{ count: number; windowStart: Date }> {
  const windowOpenedAfter = new Date(now.getTime() - windowMs);
  const rows = await getDb().$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= ${windowOpenedAfter} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${windowOpenedAfter} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  return rows[0];
}

export async function deleteRateRow(key: string): Promise<void> {
  await getDb().rateLimit.deleteMany({ where: { key } });
}

/** Rows whose window started before `before` (cleanup job). */
export async function deleteRateRowsBefore(before: Date): Promise<number> {
  const { count } = await getDb().rateLimit.deleteMany({ where: { windowStart: { lt: before } } });
  return count;
}
