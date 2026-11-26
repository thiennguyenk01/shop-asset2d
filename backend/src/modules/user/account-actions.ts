"use server";

import { refresh } from "next/cache";
import { passwordChangeSubjects } from "@backend/lib/rate-limit/rules";
import { changePasswordSchema, fieldErrors, profileSchema, resetPasswordSchema, type AuthErrorKey } from "@backend/lib/schemas/auth";
import { credentialsSignIn } from "@backend/auth/credentials";
import { AuthError, requireUser } from "@backend/auth/guards";
import { setFlash } from "@backend/flash";
import { checkRateLimit, clearRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { changePassword, setPassword, updateProfile } from "./service";

/**
 * Account page actions (Phase 3.2). Each one re-checks the session itself (defense in depth — never trust
 * that the page was protected) and only ever touches the signed-in user's own row.
 */
export type AccountFormState = {
  status: "idle" | "error" | "success";
  /** Form-level error, translation key under account.errors. */
  error?: "wrongPassword" | "signedOut" | "generic" | "tooManyAttempts";
  /** tooManyAttempts (GĐ7.2): whole minutes to wait. */
  retryMinutes?: number;
  fields?: Partial<Record<string, AuthErrorKey>>;
  values?: { name?: string };
  /** Changes on every success so the form can show its toast once per save. */
  savedAt?: number;
};

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

async function signedInUser() {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof AuthError) return null;
    throw e;
  }
}

export async function updateProfileAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await signedInUser();
  if (!user) return { status: "error", error: "signedOut" };
  const values = { name: str(form, "name") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error), values };

  await updateProfile(user.id, parsed.data);
  refresh(); // top bar avatar + menu show the new name
  return { status: "success", values: { name: parsed.data.name }, savedAt: Date.now() };
}

export async function changePasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await signedInUser();
  if (!user) return { status: "error", error: "signedOut" };
  const parsed = changePasswordSchema.safeParse({
    currentPassword: str(form, "currentPassword"),
    newPassword: str(form, "newPassword"),
    confirmPassword: str(form, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error) };

  // Wrong current passwords per account (GĐ7.2): a stolen session cannot be used to guess the password.
  const subjects = passwordChangeSubjects(user.id);
  const before = await checkRateLimit(subjects);
  if (before.limited) return { status: "error", error: "tooManyAttempts", retryMinutes: before.retryAfterMinutes };

  const result = await changePassword(user.id, parsed.data);
  if (!result.ok && result.error === "wrongPassword") {
    await recordFailure(subjects);
    const after = await checkRateLimit(subjects);
    if (after.limited) return { status: "error", error: "tooManyAttempts", retryMinutes: after.retryAfterMinutes };
    return { status: "error", error: "wrongPassword" };
  }
  if (!result.ok) return { status: "error", error: "generic" };
  await clearRateLimit(subjects[0]);

  // sessionVersion was bumped: every session (this one too) is now invalid. Sign this device in again.
  if (!(await credentialsSignIn(result.email, parsed.data.newPassword))) return { status: "error", error: "signedOut" };
  // The new session cookie makes Next re-render the whole tree (form state and toasts may reset), so the
  // confirmation travels as a flash: the form or <FlashToast /> shows it, whichever runs first.
  await setFlash("passwordChanged");
  return { status: "success", savedAt: Date.now() };
}

/**
 * "Set a password" for an account created with Google (user choice 2026-11-26): new password + confirmation only.
 * The service refuses once the account has a password (then the change-password form, which asks for the current
 * one, is the way). Like a change, every session ends; this device signs in again with the new password.
 */
export async function setPasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await signedInUser();
  if (!user) return { status: "error", error: "signedOut" };
  const parsed = resetPasswordSchema.safeParse({ password: str(form, "password"), confirmPassword: str(form, "confirmPassword") });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error) };

  const result = await setPassword(user.id, parsed.data.password);
  if (!result.ok) {
    refresh(); // the account has a password already: show the change-password form instead
    return { status: "error", error: "generic" };
  }
  if (!(await credentialsSignIn(result.email, parsed.data.password))) return { status: "error", error: "signedOut" };
  await setFlash("passwordSet");
  return { status: "success", savedAt: Date.now() };
}
