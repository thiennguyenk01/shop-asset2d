import { routing } from "@backend/i18n/routing";

export const DEFAULT_AFTER_LOGIN = "/shop";

/** Sign-in, sign-up, forgot / reset password (path without the locale prefix). Never a place to come back to. */
export function isAuthPath(path: string): boolean {
  return path === "/login" || path === "/register" || path === "/forgot-password" || path.startsWith("/reset-password/") || path === "/reset-password";
}

/**
 * Where to send the user after signing in (`?callbackUrl=`). Only same-site paths are accepted, so the
 * login page can never be used to bounce people to another site (open redirect). The locale prefix is
 * dropped because the redirect adds the current one. Anything odd falls back to the shop.
 */
export function safeCallbackPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return DEFAULT_AFTER_LOGIN;
  // Must be a path on this site: "/x", not "//host", "/\host", "http:", or anything with control chars.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f\\]/.test(raw)) {
    return DEFAULT_AFTER_LOGIN;
  }
  let url: URL;
  try {
    url = new URL(raw, "http://local.invalid");
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== "http://local.invalid") return DEFAULT_AFTER_LOGIN;

  let path = url.pathname;
  for (const locale of routing.locales) {
    if (path === `/${locale}`) path = "/";
    else if (path.startsWith(`/${locale}/`)) path = path.slice(locale.length + 1);
  }
  // Never come back to the auth pages themselves (and never carry a reset token around, GĐ6.2).
  if (path === "/" || isAuthPath(path)) return DEFAULT_AFTER_LOGIN;
  return `${path}${url.search}`;
}
