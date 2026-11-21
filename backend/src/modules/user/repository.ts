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
