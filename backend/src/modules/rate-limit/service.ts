import "server-only";
import { isLimited, rateKey, retryAfterMinutes, windowMs, type RateSubject } from "@backend/lib/rate-limit/rules";
import { addFailure, deleteRateRow, findRateRows } from "./repository";

/**
 * Failed-attempt limits (GĐ7.1, docs/ARCHITECTURE.md): check before trying, record a failure after one, clear on
 * success. Shared by every server instance through the database.
 */
export type RateCheck = { limited: false } | { limited: true; retryAfterMinutes: number };

export async function checkRateLimit(subjects: RateSubject[], now = new Date()): Promise<RateCheck> {
  const rows = new Map((await findRateRows(subjects.map(rateKey))).map((r) => [r.key, r]));
  let wait = 0;
  for (const s of subjects) {
    const row = rows.get(rateKey(s)) ?? null;
    if (isLimited(s.scope, row, now)) wait = Math.max(wait, retryAfterMinutes(s.scope, row!, now));
  }
  return wait > 0 ? { limited: true, retryAfterMinutes: wait } : { limited: false };
}

/** Counts one attempt: a failure, or — for sign-up and "forgot password" (GĐ7.2) — any well-formed request. */
export async function recordFailure(subjects: RateSubject[], now = new Date()): Promise<void> {
  for (const s of subjects) await addFailure(rateKey(s), windowMs(s.scope), now);
}

export async function clearRateLimit(subject: RateSubject): Promise<void> {
  await deleteRateRow(rateKey(subject));
}
