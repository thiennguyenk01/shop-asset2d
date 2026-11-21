"use server";

import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { redirect } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { safeCallbackPath } from "@backend/lib/auth/callback";
import { clientIp, loginSubjects, registerSubjects, resetRequestSubjects } from "@backend/lib/rate-limit/rules";
import { fieldErrors, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, type AuthErrorKey } from "@backend/lib/schemas/auth";
import { signOut } from "@backend/auth";
import { credentialsSignIn } from "@backend/auth/credentials";
import { setFlash } from "@backend/flash";
import { mergeGuestCartOnSignIn } from "@backend/modules/cart/session";
import { checkRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { requestPasswordReset, resetPasswordWithToken } from "./password-reset-service";
import { findUserIdByEmail } from "./repository";
import { registerUser } from "./service";

/**
 * Account server actions (thin layer: validate → service → Auth.js). On success they redirect on the server
 * (the new page and the top bar render with the new session cookie) and leave a flash key for the toast
 * (CLAUDE.md §8: a clear message after every action). On failure they return the form state.
 */
export type AuthFormState = {
  status: "idle" | "error";
  /** Form-level error (translation key under auth.errors). */
  error?: "invalidCredentials" | "emailTaken" | "shopPaused" | "generic" | "invalidLink" | "tooManyAttempts" | "tooManyRequests";
  /** tooManyAttempts (GĐ7.1) / tooManyRequests (GĐ7.2): whole minutes to wait. */
  retryMinutes?: number;
  fields?: Partial<Record<string, AuthErrorKey>>;
  /** Values echoed back so the form keeps them after an error (never the password). */
  values?: { email?: string; name?: string };
};


function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function loginAction(locale: Locale, _prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!hasLocale(routing.locales, locale)) return { status: "error", error: "generic" };
  const parsed = loginSchema.safeParse({ email: str(form, "email"), password: str(form, "password") });
  const values = { email: str(form, "email") };
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error), values };

  // Too many failed sign-ins for this email or IP (GĐ7.1): say how long to wait. authorize() enforces the same
  // limit for every way in; this check only words the answer. It applies to any email, existing or not.
  const subjects = loginSubjects(parsed.data.email, clientIp(await headers()));
  const before = await checkRateLimit(subjects);
  if (before.limited) return { status: "error", error: "tooManyAttempts", retryMinutes: before.retryAfterMinutes, values };

  // Same message for unknown email, wrong password and locked account: no account enumeration.
  if (!(await credentialsSignIn(parsed.data.email, parsed.data.password))) {
    const after = await checkRateLimit(subjects);
    if (after.limited) return { status: "error", error: "tooManyAttempts", retryMinutes: after.retryAfterMinutes, values };
    return { status: "error", error: "invalidCredentials", values };
  }
  const userId = await findUserIdByEmail(parsed.data.email);
  if (userId) await mergeGuestCartOnSignIn(userId); // CLAUDE.md §5: guest cart joins the account cart
  await setFlash("signedIn");
  redirect({ href: safeCallbackPath(form.get("callbackUrl")), locale });
  return { status: "idle" }; // unreachable: redirect() throws
}

export async function registerAction(locale: Locale, _prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!hasLocale(routing.locales, locale)) return { status: "error", error: "generic" };
  const values = { email: str(form, "email"), name: str(form, "name") };
  const parsed = registerSchema.safeParse({
    name: str(form, "name"),
    email: str(form, "email"),
    password: str(form, "password"),
    confirmPassword: str(form, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error), values };

  // Sign-ups per IP (GĐ7.2): every well-formed request counts, created or "email taken".
  const subjects = registerSubjects(clientIp(await headers()));
  const limit = await checkRateLimit(subjects);
  if (limit.limited) return { status: "error", error: "tooManyRequests", retryMinutes: limit.retryAfterMinutes, values };
  await recordFailure(subjects);

  const result = await registerUser(parsed.data, locale);
  if (!result.ok) return { status: "error", error: result.error, values };

  if (!(await credentialsSignIn(parsed.data.email, parsed.data.password))) {
    // Account exists but the automatic sign-in failed: send them to the login page instead of failing silently.
    redirect({ href: "/login", locale });
  }
  await mergeGuestCartOnSignIn(result.userId);
  await setFlash("registered");
  redirect({ href: safeCallbackPath(form.get("callbackUrl")), locale });
  return { status: "idle" }; // unreachable: redirect() throws
}

/** "Forgot password" form (GĐ6.2): `sent` is the only answer once the email is well-formed. */
export type ForgotFormState = {
  status: "idle" | "error" | "sent";
  /** Too many requests from this IP (GĐ7.2), with the whole minutes to wait. */
  error?: "tooManyRequests";
  retryMinutes?: number;
  fields?: Partial<Record<string, AuthErrorKey>>;
  values?: { email?: string };
};

export async function forgotPasswordAction(locale: Locale, _prev: ForgotFormState, form: FormData): Promise<ForgotFormState> {
  if (!hasLocale(routing.locales, locale)) return { status: "error" };
  const values = { email: str(form, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error), values };
  // Requests per IP (GĐ7.2): the same for every email, so it says nothing about which accounts exist.
  const subjects = resetRequestSubjects(clientIp(await headers()));
  const limit = await checkRateLimit(subjects);
  if (limit.limited) return { status: "error", error: "tooManyRequests", retryMinutes: limit.retryAfterMinutes, values };
  await recordFailure(subjects);
  // Same answer whether or not the email has an account (no account enumeration).
  await requestPasswordReset(parsed.data.email, locale);
  return { status: "sent", values };
}

/** New password from a reset link: on success the link is used up, every session ends, and the login page opens. */
export async function resetPasswordAction(locale: Locale, token: string, _prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!hasLocale(routing.locales, locale)) return { status: "error", error: "generic" };
  const parsed = resetPasswordSchema.safeParse({ password: str(form, "password"), confirmPassword: str(form, "confirmPassword") });
  if (!parsed.success) return { status: "error", fields: fieldErrors(parsed.error) };
  const result = await resetPasswordWithToken(token, parsed.data.password);
  if (!result.ok) return { status: "error", error: result.error };
  await setFlash("passwordReset");
  redirect({ href: "/login", locale });
  return { status: "idle" }; // unreachable: redirect() throws
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
}
