import type { Metadata, MetadataRoute } from "next";
import { HTML_LANG, routing, type Locale } from "@backend/i18n/routing";
import { INFO_PAGES } from "@backend/lib/info-pages";

/**
 * Search engines and link previews (GĐ7.3) — pure helpers, unit-tested.
 *
 * Indexable pages: the shop, the information pages (About, FAQ, terms, privacy, refund) and each pack page, in every language the page exists in (a pack only exists in the
 * languages it is written in, DECISIONS #39). Everything private already says `noindex` itself.
 * Paths here are relative (`/vi/shop`): the root layout sets `metadataBase` from APP_URL; the sitemap, which
 * needs absolute URLs, passes the base explicitly.
 */

/** Open Graph locale codes (language_TERRITORY). */
export const OG_LOCALE: Record<Locale, string> = { vi: "vi_VN", en: "en_US", zh: "zh_CN" };

export const localePath = (locale: Locale, path: string) => `/${locale}${path}`;

/** In the order of `routing.locales`, only those in `available`. */
const ordered = (available: readonly Locale[]) => routing.locales.filter((l) => available.includes(l));

/**
 * hreflang map for one page: one entry per language it exists in (keys are the <html lang> codes, e.g. zh-CN),
 * plus `x-default` = the Vietnamese page (the site's default language), or the first one there is.
 */
export function languageAlternates(path: string, available: readonly Locale[], base = ""): Record<string, string> {
  const locales = ordered(available);
  const url = (l: Locale) => base + localePath(l, path);
  const out: Record<string, string> = {};
  for (const l of locales) out[HTML_LANG[l]] = url(l);
  const fallback = locales.includes(routing.defaultLocale) ? routing.defaultLocale : locales[0];
  if (fallback) out["x-default"] = url(fallback);
  return out;
}

/** canonical (this language) + the other languages of the same page. */
export function pageAlternates(locale: Locale, path: string, available: readonly Locale[]): Metadata["alternates"] {
  return { canonical: localePath(locale, path), languages: languageAlternates(path, available) };
}

/** The site icon: the link preview image when a page has no picture of its own (or only SVG demo pictures). */
export const DEFAULT_SHARE_IMAGE = "/icon.png";

/** Image types link previews can show (SVG and video are not). */
export function isShareableImage(mimeType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType);
}

/**
 * Link preview fields. Metadata merges shallowly (a page's `openGraph` replaces the layout's), so every page
 * passes the whole set through here.
 */
export function shareMetadata(input: {
  locale: Locale;
  siteName: string;
  title: string;
  description: string;
  /** The page (without the locale); omitted for the layout's default set, which serves many pages. */
  path?: string;
  /** A page picture (absolute or site-relative URL); none → the site icon, shown as a small card. */
  image?: string | null;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const image = input.image ?? DEFAULT_SHARE_IMAGE;
  return {
    openGraph: {
      type: "website",
      siteName: input.siteName,
      locale: OG_LOCALE[input.locale],
      alternateLocale: routing.locales.filter((l) => l !== input.locale).map((l) => OG_LOCALE[l]),
      title: input.title,
      description: input.description,
      ...(input.path ? { url: localePath(input.locale, input.path) } : {}),
      images: [image],
    },
    twitter: {
      card: input.image ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

/**
 * robots.txt. Only the real production site may be crawled; development, test runs and Vercel previews say
 * "nothing here" (a preview must never compete with the real site in search results).
 * Private pages are not listed: they carry `noindex`, which a crawler can only see if it may fetch them.
 */
export function robotsFor(appEnv: string, appUrl: string): MetadataRoute.Robots {
  if (appEnv !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...routing.locales.map((l) => `/${l}/admin`)] },
    sitemap: new URL("/sitemap.xml", appUrl).toString(),
  };
}

/** sitemap.xml: the shop in every language, and each pack in the languages it is written in. */
export function sitemapEntries(appUrl: string, packs: { slug: string; locales: readonly Locale[] }[]): MetadataRoute.Sitemap {
  const base = new URL(appUrl).origin;
  const entry = (path: string, locales: readonly Locale[]) =>
    ordered(locales).map((l) => ({
      url: base + localePath(l, path),
      alternates: { languages: languageAlternates(path, locales, base) },
    }));
  return [
    ...entry("/shop", routing.locales),
    ...INFO_PAGES.flatMap((p) => entry(`/${p}`, routing.locales)),
    ...packs.flatMap((p) => entry(`/product/${p.slug}`, p.locales)),
  ];
}

/** slug → the languages it is visible in, from one slug list per language. */
export function packLocales(slugsByLocale: Partial<Record<Locale, readonly string[]>>): { slug: string; locales: Locale[] }[] {
  const map = new Map<string, Locale[]>();
  for (const l of routing.locales) for (const slug of slugsByLocale[l] ?? []) map.set(slug, [...(map.get(slug) ?? []), l]);
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([slug, locales]) => ({ slug, locales }));
}
