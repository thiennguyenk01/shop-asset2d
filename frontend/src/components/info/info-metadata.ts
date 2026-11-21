import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@backend/i18n/routing";
import type { InfoPage } from "@backend/lib/info-pages";
import { pageAlternates, shareMetadata } from "@backend/lib/seo/seo";

/** Title (the menu / link name), description, the 3 language versions and link previews of an info page. */
export async function infoMetadata(page: InfoPage, params: Promise<{ locale: string }>): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [tn, ti, tm] = await Promise.all([getTranslations("nav"), getTranslations("info"), getTranslations("metadata")]);
  const title = tn(page);
  const description = ti(`${page}.metaDescription`);
  const path = `/${page}`;
  return {
    title,
    description,
    alternates: pageAlternates(locale, path, routing.locales),
    ...shareMetadata({ locale, siteName: tm("siteName"), title, description, path }),
  };
}
