import "server-only";
import { Prisma, type Locale } from "@backend/generated/prisma/client";
import { hashPassword, verifyPassword } from "@backend/auth/password";
import type { ChangePasswordInput, ProfileInput, RegisterInput } from "@backend/lib/schemas/auth";
import { databaseBlockedByFreeTier } from "@backend/modules/usage/guard";
import {
  createUser,
  findSignInMethods,
  findUserCredentials,
  findUserProfile,
  setFirstPassword,
  updatePasswordAndRevokeSessions,
  updateUserName,
} from "./repository";

/** shopPaused: "free plans only" is on and the database has reached the free allowance. */
export type RegisterResult = { ok: true; userId: string } | { ok: false; error: "emailTaken" | "shopPaused" };

/**
 * Create a USER account (CLAUDE.md §5: everyone signs up as USER; ADMIN is never self-assigned).
 * Input must already be validated by `registerSchema` (email trimmed + lower-cased).
 * The unique index on email is the source of truth, so two parallel sign-ups cannot both succeed.
 */
export async function registerUser(input: RegisterInput, locale: Locale): Promise<RegisterResult> {
  if (await databaseBlockedByFreeTier()) return { ok: false, error: "shopPaused" };
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await createUser({ email: input.email, name: input.name, passwordHash, preferredLocale: locale });
    return { ok: true, userId: user.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "emailTaken" };
    throw e;
  }
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
  await updateUserName(userId, input.name);
}

export type ChangePasswordResult = { ok: true; email: string } | { ok: false; error: "wrongPassword" | "unavailable" };

/**
 * Change the password after checking the current one. Bumps sessionVersion, so every other device is
 * signed out on its next request; the action signs this device in again with the new password.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const user = await findUserCredentials(userId);
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) return { ok: false, error: "unavailable" };
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) return { ok: false, error: "wrongPassword" };
  await updatePasswordAndRevokeSessions(userId, await hashPassword(input.newPassword));
  return { ok: true, email: user.email };
}

/**
 * First password of an account created with Google (user choice 2026-11-26): no current password to check, so it
 * only works while the account has none. Bumps sessionVersion; the action signs this device in again.
 */
export async function setPassword(userId: string, password: string): Promise<{ ok: true; email: string } | { ok: false }> {
  const row = await setFirstPassword(userId, await hashPassword(password));
  return row ? { ok: true, email: row.email } : { ok: false };
}

/** How the signed-in account can sign in (account page: change vs. set password, "linked to Google"). */
export function getSignInMethods(userId: string) {
  return findSignInMethods(userId);
}

/** Profile data for the account page (the caller passes the signed-in user's id, never a client value). */
export function getProfile(userId: string) {
  return findUserProfile(userId);
}
