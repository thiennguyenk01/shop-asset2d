import "server-only";
import { getDb } from "@backend/db";
import type { Locale } from "@backend/generated/prisma/client";
import type { UserAuthState } from "@backend/auth/session-validation";

/** Re-read on every session check (jwt callback). Name/email ride along so a profile edit shows at once. */
export function findUserAuthState(id: string): Promise<(UserAuthState & { name: string | null; email: string }) | null> {
  return getDb().user.findUnique({
    where: { id },
    select: { id: true, status: true, sessionVersion: true, role: true, name: true, email: true },
  });
}

export function findUserForLogin(email: string) {
  return getDb().user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      status: true,
      role: true,
      sessionVersion: true,
    },
  });
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  return (await getDb().user.findUnique({ where: { email }, select: { id: true } }))?.id ?? null;
}

export function createUser(data: { email: string; name: string; passwordHash: string; preferredLocale: Locale }) {
  return getDb().user.create({ data, select: { id: true } });
}

export function findUserProfile(id: string) {
  return getDb().user.findUnique({ where: { id }, select: { id: true, name: true, email: true, createdAt: true } });
}

export function findUserCredentials(id: string) {
  return getDb().user.findUnique({ where: { id }, select: { id: true, email: true, passwordHash: true, status: true } });
}

export function updateUserName(id: string, name: string) {
  return getDb().user.update({ where: { id }, data: { name }, select: { id: true } });
}

// ───────────────────────────── password reset (GĐ6.2) ─────────────────────────────

export function findUserForReset(email: string) {
  return getDb().user.findUnique({ where: { email }, select: { id: true, email: true, name: true, status: true } });
}

export function countResetTokensSince(userId: string, since: Date): Promise<number> {
  return getDb().passwordResetToken.count({ where: { userId, createdAt: { gte: since } } });
}

/** A new link cancels the earlier unused links of the account (only the newest mail works). */
export function insertResetToken(userId: string, tokenHash: string, expiresAt: Date, now: Date) {
  return getDb().$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt }, select: { id: true } });
  });
}

/** A link still usable: unused, not expired, account active. */
export function findUsableResetToken(tokenHash: string, now: Date) {
  return getDb().passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now }, user: { status: "ACTIVE" } },
    select: { id: true, userId: true },
  });
}

/**
 * Use the link and set the password in one transaction: the link is claimed with a conditional update (two
 * parallel submits cannot both pass), the password changes with a sessionVersion bump (every session of the
 * account must sign in again, CLAUDE.md "Bất khả xâm phạm"), and the other open links of the account die.
 * Returns the account email, or null when the link was not usable.
 */
export function consumeResetToken(tokenHash: string, passwordHash: string, now: Date): Promise<{ email: string } | null> {
  return getDb().$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now }, user: { status: "ACTIVE" } },
      select: { id: true, userId: true },
    });
    if (!token) return null;
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) return null;
    const user = await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { email: true },
    });
    await tx.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    return user;
  });
}

/**
 * New password + sessionVersion bump in one write: every JWT issued before this moment stops working
 * on its next check (CLAUDE.md §13). The caller signs the current device in again.
 */
export function updatePasswordAndRevokeSessions(id: string, passwordHash: string) {
  return getDb().user.update({
    where: { id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { id: true },
  });
}

// ───────────────────────────── Google sign-in (user choice 2026-11-26) ─────────────────────────────

export const GOOGLE_PROVIDER = "google";

/** The account joined to this Google account (Google's stable id, `sub`). */
export async function findUserByGoogleAccount(sub: string) {
  const row = await getDb().account.findUnique({
    where: { provider_providerAccountId: { provider: GOOGLE_PROVIDER, providerAccountId: sub } },
    select: { user: { select: { id: true, status: true, sessionVersion: true, role: true, name: true, email: true } } },
  });
  return row?.user ?? null;
}

export function findUserStatusByEmail(email: string) {
  return getDb().user.findUnique({ where: { email }, select: { id: true, status: true } });
}

/** Join an existing account to Google; Google verified the email, so the account's email counts as verified too. */
export function linkGoogleAccount(userId: string, sub: string, now: Date) {
  return getDb().$transaction(async (tx) => {
    await tx.account.create({ data: { userId, type: "oidc", provider: GOOGLE_PROVIDER, providerAccountId: sub }, select: { id: true } });
    await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
  });
}

/** A new account from Google: no password (it can be set later on the account page), email already verified. */
export function createGoogleUser(data: { email: string; name: string | null; preferredLocale: Locale; sub: string }, now: Date) {
  return getDb().user.create({
    data: {
      email: data.email,
      name: data.name,
      preferredLocale: data.preferredLocale,
      emailVerifiedAt: now,
      accounts: { create: { type: "oidc", provider: GOOGLE_PROVIDER, providerAccountId: data.sub } },
    },
    select: { id: true },
  });
}

/** Ways this account signs in (account page). */
export async function findSignInMethods(userId: string): Promise<{ hasPassword: boolean; google: boolean } | null> {
  const row = await getDb().user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, accounts: { where: { provider: GOOGLE_PROVIDER }, select: { id: true }, take: 1 } },
  });
  return row ? { hasPassword: !!row.passwordHash, google: row.accounts.length > 0 } : null;
}

/**
 * First password of an account created with Google. Only while it has none (a conditional update, so it can never
 * overwrite a password without the current one), with a sessionVersion bump like every password change (CLAUDE.md
 * "Bất khả xâm phạm"): the caller signs this device in again. Returns the email, or null when a password exists.
 */
export async function setFirstPassword(id: string, passwordHash: string): Promise<{ email: string } | null> {
  const { count } = await getDb().user.updateMany({
    where: { id, passwordHash: null, status: "ACTIVE" },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  if (count !== 1) return null;
  return getDb().user.findUnique({ where: { id }, select: { email: true } });
}
