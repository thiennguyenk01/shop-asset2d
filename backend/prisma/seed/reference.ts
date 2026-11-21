/**
 * Reference data (GĐ7.4): the 21 categories, genres, art styles and the "Lợi ích" (benefits) rows, with their
 * translations. Upsert only — it never deletes anything and never touches products, coupons, users or files.
 *
 * Used by the demo seed (`npm run db:seed`, development) and by `npm run db:prod:reference` (production, user
 * choice 2026-11-20: a separate command that writes reference data only — no demo packs, no test coupons).
 */
import type { Locale, PrismaClient } from "../../src/generated/prisma/client";
import { ART_STYLES, CATEGORIES, GENRES, LICENSES } from "./data/catalog";

const LOCALES: Locale[] = ["vi", "en", "zh"];

export type ReferenceIds = {
  categoryIds: Map<string, string>;
  genreIds: Map<string, string>;
  styleIds: Map<string, string>;
  licenseIds: Map<string, string>;
};

export const REFERENCE_COUNTS = {
  categories: CATEGORIES.length,
  genres: GENRES.length,
  styles: ART_STYLES.length,
  licenses: LICENSES.length,
};

export async function upsertReferenceData(db: PrismaClient): Promise<ReferenceIds> {
  const categoryIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      update: { sortOrder: i + 1, iconKey: c.icon, isActive: true },
      create: { slug: c.slug, sortOrder: i + 1, iconKey: c.icon },
    });
    for (const locale of LOCALES) {
      await db.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: row.id, locale } },
        update: { name: c.name[locale], description: c.description[locale] },
        create: { categoryId: row.id, locale, name: c.name[locale], description: c.description[locale] },
      });
    }
    categoryIds.set(c.slug, row.id);
  }

  const genreIds = new Map<string, string>();
  for (const [i, g] of GENRES.entries()) {
    const row = await db.genre.upsert({ where: { slug: g.slug }, update: { sortOrder: i + 1 }, create: { slug: g.slug, sortOrder: i + 1 } });
    for (const locale of LOCALES) {
      await db.genreTranslation.upsert({
        where: { genreId_locale: { genreId: row.id, locale } },
        update: { name: g.name[locale] },
        create: { genreId: row.id, locale, name: g.name[locale] },
      });
    }
    genreIds.set(g.slug, row.id);
  }

  const styleIds = new Map<string, string>();
  for (const [i, s] of ART_STYLES.entries()) {
    const row = await db.artStyle.upsert({ where: { slug: s.slug }, update: { sortOrder: i + 1 }, create: { slug: s.slug, sortOrder: i + 1 } });
    for (const locale of LOCALES) {
      await db.artStyleTranslation.upsert({
        where: { artStyleId_locale: { artStyleId: row.id, locale } },
        update: { name: s.name[locale] },
        create: { artStyleId: row.id, locale, name: s.name[locale] },
      });
    }
    styleIds.set(s.slug, row.id);
  }

  const licenseIds = new Map<string, string>();
  for (const [i, l] of LICENSES.entries()) {
    const { code, name, summary, terms, ...flags } = l;
    const row = await db.license.upsert({ where: { code }, update: { ...flags, sortOrder: i + 1 }, create: { code, ...flags, sortOrder: i + 1 } });
    for (const locale of LOCALES) {
      const t = { name: name[locale], summary: summary[locale], terms: terms[locale] };
      await db.licenseTranslation.upsert({
        where: { licenseId_locale: { licenseId: row.id, locale } },
        update: t,
        create: { licenseId: row.id, locale, ...t },
      });
    }
    licenseIds.set(code, row.id);
  }

  return { categoryIds, genreIds, styleIds, licenseIds };
}
