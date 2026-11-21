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
