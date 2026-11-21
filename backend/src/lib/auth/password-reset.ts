import { createHash, randomBytes } from "node:crypto";

/**
 * Password reset links (GĐ6.2, DECISIONS #38 + PENDING choices) — pure helpers, unit-tested.
 * - The link carries a random 256-bit token; only its SHA-256 is stored (`PasswordResetToken.tokenHash`), so a
 *   database leak gives no usable link.
 * - A link works once and for RESET_TTL_MINUTES; asking again cancels the earlier links of the account.
 * - At most RESET_MAX_PER_HOUR links per account per hour (protects a mailbox from being flooded).
 */
export const RESET_TTL_MINUTES = 30;
export const RESET_MAX_PER_HOUR = 3;

/** base64url of 32 random bytes: 43 characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before touching the database (a URL segment can be anything). */
export function isResetTokenShape(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function resetExpiry(now: Date): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60_000);
}

/** Path of the reset page for a token, in the customer's language (the mail adds the site address). */
export function resetPath(locale: string, token: string): string {
  return `/${locale}/reset-password/${token}`;
}
