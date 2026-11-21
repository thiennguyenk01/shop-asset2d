/**
 * Free allowances of the services the shop runs on (Admin "Usage", user choice 2026-11-22: written in the code,
 * from each provider's pricing page; change them here when a provider changes its plan). Decimal units, as the
 * providers state them (1 GB = 10^9 bytes): the bar then fills slightly early, never late.
 */
export const FREE_LIMITS_CHECKED_ON = "2026-11-22";

export const FREE_LIMITS = {
  /** Neon Free: 1 GB of Postgres storage per project (all branches of the project share it). */
  database: { limit: 1_000_000_000, source: "https://neon.com/faqs/free-plan-limits-and-quotas" },
  /** Cloudflare R2: 10 GB-month of Standard storage per account (every bucket of the account counts). */
  storage: { limit: 10_000_000_000, source: "https://developers.cloudflare.com/r2/pricing/" },
  /** Resend Free: 100 emails a day. */
  emailDay: { limit: 100, source: "https://resend.com/docs/knowledge-base/account-quotas-and-limits" },
  /** Resend Free: 3,000 emails a month. */
  emailMonth: { limit: 3_000, source: "https://resend.com/docs/knowledge-base/account-quotas-and-limits" },
} as const;

export type UsageKey = keyof typeof FREE_LIMITS;
export type UsageLevel = "ok" | "warn" | "critical";

/** From 80 %: a warning on the Admin overview; from 95 %: the same in red. */
export const WARN_RATIO = 0.8;
export const CRITICAL_RATIO = 0.95;

export function usagePercent(used: number, limit: number): number {
  return limit > 0 ? Math.round((used / limit) * 100) : 0;
}

export function usageLevel(used: number, limit: number): UsageLevel {
  const ratio = limit > 0 ? used / limit : 0;
  return ratio >= CRITICAL_RATIO ? "critical" : ratio >= WARN_RATIO ? "warn" : "ok";
}

export function worstLevel(levels: readonly UsageLevel[]): UsageLevel {
  return levels.includes("critical") ? "critical" : levels.includes("warn") ? "warn" : "ok";
}

/** The windows emails are counted in: the last 24 hours (the stricter reading of Resend's day) and the UTC month. */
export function emailWindows(now: Date): { day: Date; month: Date } {
  return {
    day: new Date(now.getTime() - 24 * 3_600_000),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

/**
 * "Free plans only" (user choice 2026-11-22). R2 is the one service that bills an overage (a payment method is on
 * file), and the app only sees its own two buckets of an account-wide allowance (dev and preview buckets count
 * too), so uploads stop at 90 % of it. The other services stop by themselves at their limit; the app stops just
 * before, with a clear message.
 */
export const STORAGE_BLOCK_RATIO = 0.9;

/** An upload of `addBytes` would take this environment's buckets past 90 % of the R2 allowance. */
export function uploadOverFreeStorage(usedBytes: number, addBytes: number): boolean {
  return usedBytes + Math.max(0, addBytes) > FREE_LIMITS.storage.limit * STORAGE_BLOCK_RATIO;
}

/** The database has reached the Neon allowance: no new accounts or orders. */
export function databaseFull(usedBytes: number): boolean {
  return usedBytes >= FREE_LIMITS.database.limit;
}

/** Mails already sent (before this one) in the last 24 hours / since the start of the month. */
export function mailOverFreeQuota(sentDay: number, sentMonth: number): boolean {
  return sentDay >= FREE_LIMITS.emailDay.limit || sentMonth >= FREE_LIMITS.emailMonth.limit;
}

/** The R2 bytes at which uploads stop (shown on the Usage page). */
export const STORAGE_BLOCK_BYTES = FREE_LIMITS.storage.limit * STORAGE_BLOCK_RATIO;
