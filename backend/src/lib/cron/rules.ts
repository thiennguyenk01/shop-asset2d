import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs (GĐ6.3, DECISIONS #38 + PENDING choices) — pure rules, unit-tested.
 *
 * - reconcile: a PENDING order is shown as EXPIRED from `expiresAt` on (lib/payment/rules.ts, read lazily); the
 *   job writes EXPIRED only ORDER_EXPIRE_GRACE_MINUTES later, so a payment confirmation that arrives a little
 *   late can still settle the order. Once EXPIRED is written, a late confirmation is ignored.
 * - cleanup: guest carts untouched for GUEST_CART_DAYS days, and uploaded objects no row refers to after
 *   ORPHAN_UPLOAD_HOURS hours (an Admin upload that was never finished, or an object left behind when its row was
 *   deleted). Only keys under UPLOAD_PREFIX are considered: the seeded demo files live elsewhere.
 */
export const ORDER_EXPIRE_GRACE_MINUTES = 15;
export const GUEST_CART_DAYS = 30;
export const ORPHAN_UPLOAD_HOURS = 24;
export const UPLOAD_PREFIX = "packs";

export const CRON_JOBS = ["reconcile", "cleanup"] as const;
export type CronJob = (typeof CRON_JOBS)[number];

export function isCronJob(v: string): v is CronJob {
  return (CRON_JOBS as readonly string[]).includes(v);
}

const minutes = (n: number) => n * 60_000;

/** PENDING orders that expired before this moment are written as EXPIRED. */
export function expireBefore(now: Date): Date {
  return new Date(now.getTime() - minutes(ORDER_EXPIRE_GRACE_MINUTES));
}

/** Guest carts with no change since this moment are removed. */
export function guestCartCutoff(now: Date): Date {
  return new Date(now.getTime() - minutes(GUEST_CART_DAYS * 24 * 60));
}

/** Uploaded objects older than this moment may be removed when nothing refers to them. */
export function orphanUploadCutoff(now: Date): Date {
  return new Date(now.getTime() - minutes(ORPHAN_UPLOAD_HOURS * 60));
}

/**
 * `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends). No secret configured → every call is refused.
 * Compared in constant time (on SHA-256 digests, so the lengths always match).
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization.slice("Bearer ".length)), digest(secret));
}
