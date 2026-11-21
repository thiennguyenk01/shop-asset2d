import { defineRouting } from "next-intl/routing";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * CLAUDE.md §8 — locales: vi (default), en, zh (Simplified Chinese).
 * - Always prefixed: /vi/..., /en/...
 * - First visit is ALWAYS `vi` (browser language is ignored) — see src/proxy.ts.
 * - The user's choice is remembered in the NEXT_LOCALE cookie for one year.
 */
export const routing = defineRouting({
  locales: ["vi", "en", "zh"],
  defaultLocale: "vi",
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
  // GĐ7.3: no automatic `Link: …; rel="alternate"` response header. It listed every language for EVERY page
  // (private ones too, `zh` instead of zh-CN, x-default = /shop which only redirects); the indexable pages declare
  // their languages themselves (backend/src/lib/seo/seo.ts).
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

/** Value for <html lang>. URL segment stays short (/zh) while the document declares Simplified Chinese. */
export const HTML_LANG: Record<Locale, string> = { vi: "vi", en: "en", zh: "zh-CN" };
