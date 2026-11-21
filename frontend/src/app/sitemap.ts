import type { MetadataRoute } from "next";
import { routing } from "@backend/i18n/routing";
import { packLocales, sitemapEntries } from "@backend/lib/seo/seo";
import { getEnv } from "@backend/env";
import { listPublishedSlugs } from "@backend/modules/product/queries";

/**
 * /sitemap.xml (GĐ7.3): the shop in every language and each published pack in the languages it is written in,
 * with the other languages of each page as alternates. Uses the cached catalog queries (tag "catalog"), so an
 * Admin change refreshes it like the shop.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lists = await Promise.all(routing.locales.map(async (l) => [l, await listPublishedSlugs(l)] as const));
  return sitemapEntries(getEnv().APP_URL, packLocales(Object.fromEntries(lists)));
}
