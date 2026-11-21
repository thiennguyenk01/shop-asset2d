import "server-only";
import type { Locale } from "@backend/i18n/routing";
import {
  hashResetToken,
  isResetTokenShape,
  newResetToken,
  RESET_MAX_PER_HOUR,
  RESET_TTL_MINUTES,
  resetExpiry,
  resetPath,
} from "@backend/lib/auth/password-reset";
import { hashPassword } from "@backend/auth/password";
import { getEnv } from "@backend/env";
import { sendPasswordResetMail } from "@backend/mail";
import {
  consumeResetToken,
  countResetTokensSince,
  findUsableResetToken,
  findUserForReset,
  insertResetToken,
} from "./repository";

/**
 * Forgot / reset password (GĐ6.2). The caller (action) has validated the input.
 *
 * `requestPasswordReset` never tells whether the email has an account: unknown email, locked account and the
 * hourly limit all end the same way as a sent mail (the page always says "if the email has an account, a link
 * was sent"). The mail is written in the language the customer is using (DECISIONS #38).
 */
export async function requestPasswordReset(email: string, locale: Locale, now = new Date()): Promise<void> {
  const user = await findUserForReset(email);
  if (!user || user.status !== "ACTIVE") return;
  if ((await countResetTokensSince(user.id, new Date(now.getTime() - 60 * 60_000))) >= RESET_MAX_PER_HOUR) return;

  const { token, tokenHash } = newResetToken();
  await insertResetToken(user.id, tokenHash, resetExpiry(now), now);
  try {
    await sendPasswordResetMail(user.email, locale, {
      name: user.name,
      url: new URL(resetPath(locale, token), getEnv().APP_URL).toString(),
      minutes: RESET_TTL_MINUTES,
    });
  } catch (e) {
    // The answer stays the same (no account enumeration); the failure is for the server log only, never the link.
    console.error("[mail] password reset mail failed:", e instanceof Error ? e.message : e);
  }
}

/** Whether the reset page should show the form (true) or "this link is not valid any more". */
export async function isResetLinkUsable(token: string, now = new Date()): Promise<boolean> {
  if (!isResetTokenShape(token)) return false;
  return (await findUsableResetToken(hashResetToken(token), now)) !== null;
}

export type ResetPasswordResult = { ok: true; email: string } | { ok: false; error: "invalidLink" };

export async function resetPasswordWithToken(
  token: string,
  password: string,
  now = new Date(),
): Promise<ResetPasswordResult> {
  if (!isResetTokenShape(token)) return { ok: false, error: "invalidLink" };
  const done = await consumeResetToken(hashResetToken(token), await hashPassword(password), now);
  return done ? { ok: true, email: done.email } : { ok: false, error: "invalidLink" };
}
