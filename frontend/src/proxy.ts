import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, routing } from "@backend/i18n/routing";

/**
 * Locale routing (CLAUDE.md §8).
 * - No valid NEXT_LOCALE cookie (first visit): never look at Accept-Language → always `vi`.
 * - Valid cookie: honour the user's previous choice (e.g. `/` → `/en`).
 * Auth checks for /admin are added in Phase 5; they must ALSO be enforced inside each
 * server action / route handler (proxy is not a security boundary on its own).
 */
const firstVisit = createMiddleware({ ...routing, localeDetection: false });
const returningVisit = createMiddleware({ ...routing, localeDetection: true });

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const hasValidCookie = !!cookie && (routing.locales as readonly string[]).includes(cookie);
  return hasValidCookie ? returningVisit(request) : firstVisit(request);
}

export const config = {
  // Skip API routes, Next internals, Vercel internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
