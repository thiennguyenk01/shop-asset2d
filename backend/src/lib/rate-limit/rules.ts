import { createHash } from "node:crypto";

/**
 * Failed-attempt limits (GĐ7.1; storage: the Neon database, user choice 2026-11-20) — pure rules, unit-tested.
 *
 * A subject (an email, an IP, a shopper, an account) that reaches `max` counted attempts inside its window is
 * refused until the window that started with its first counted attempt is over:
 * - sign-in (failures only): per email (whatever the email, so the answer says nothing about which accounts
 *   exist) and per IP; a successful sign-in clears the email's counter;
 * - coupon codes (failures only): per shopper (account, or guest cart) and per IP;
 * - GĐ7.2 — sign-up (every well-formed request: each costs a password hash, and "email taken" answers would
 *   otherwise list accounts quickly) and "forgot password" (every well-formed request: each may send an email):
 *   per IP;
 * - GĐ7.2 — change password (wrong current password only): per account; a successful change clears it.
 * The IP is the one the hosting proxy reports (Vercel sets x-real-ip / x-forwarded-for itself).
 */
export const RATE_LIMITS = {
  loginEmail: { max: 10, windowMinutes: 15 },
  loginIp: { max: 100, windowMinutes: 15 },
  couponShopper: { max: 10, windowMinutes: 10 },
  couponIp: { max: 30, windowMinutes: 10 },
  registerIp: { max: 10, windowMinutes: 60 },
  resetRequestIp: { max: 10, windowMinutes: 60 },
  passwordChange: { max: 10, windowMinutes: 15 },
} as const;

export type RateScope = keyof typeof RATE_LIMITS;
export type RateSubject = { scope: RateScope; subject: string };

/** Rows older than this are removed by the cleanup job (longer than every window). */
export const RATE_LIMIT_RETENTION_HOURS = 24;

/** Storage key: the scope plus a SHA-256 of the normalised subject — never the raw email or IP. */
export function rateKey({ scope, subject }: RateSubject): string {
  return `${scope}:${createHash("sha256").update(subject.trim().toLowerCase(), "utf8").digest("hex")}`;
}

export function windowMs(scope: RateScope): number {
  return RATE_LIMITS[scope].windowMinutes * 60_000;
}

export type RateRow = { count: number; windowStart: Date };

/** Still inside the window and at (or over) the limit. */
export function isLimited(scope: RateScope, row: RateRow | null, now: Date): boolean {
  if (!row) return false;
  return now.getTime() - row.windowStart.getTime() < windowMs(scope) && row.count >= RATE_LIMITS[scope].max;
}

/** Whole minutes until the window ends (at least 1). */
export function retryAfterMinutes(scope: RateScope, row: RateRow, now: Date): number {
  const left = row.windowStart.getTime() + windowMs(scope) - now.getTime();
  return Math.max(1, Math.ceil(left / 60_000));
}

/** Rows whose window started before this moment can be removed. */
export function rateLimitCutoff(now: Date): Date {
  return new Date(now.getTime() - RATE_LIMIT_RETENTION_HOURS * 3_600_000);
}

const IP_RE = /^[0-9a-f.:]{2,45}$/i;

/** The client IP reported by the hosting proxy; "unknown" when there is none (all such callers share one counter). */
export function clientIp(headers: { get(name: string): string | null }): string {
  const candidates = [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]];
  for (const c of candidates) {
    const ip = c?.trim();
    if (ip && IP_RE.test(ip)) return ip;
  }
  return "unknown";
}

export const loginSubjects = (email: string, ip: string): RateSubject[] => [
  { scope: "loginEmail", subject: email },
  { scope: "loginIp", subject: ip },
];

/** shopper = "user:<id>" or "guest:<cart token hash>"; null when the guest has no cart yet (then the IP only). */
export const couponSubjects = (shopper: string | null, ip: string): RateSubject[] => [
  ...(shopper ? [{ scope: "couponShopper" as const, subject: shopper }] : []),
  { scope: "couponIp", subject: ip },
];

export const registerSubjects = (ip: string): RateSubject[] => [{ scope: "registerIp", subject: ip }];
export const resetRequestSubjects = (ip: string): RateSubject[] => [{ scope: "resetRequestIp", subject: ip }];
/** The signed-in account changing its password (its id). */
export const passwordChangeSubjects = (userId: string): RateSubject[] => [{ scope: "passwordChange", subject: `user:${userId}` }];
