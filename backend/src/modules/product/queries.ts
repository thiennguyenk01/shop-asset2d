import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@backend/generated/prisma/client";
import type { Locale } from "@backend/i18n/routing";
import { changelogText } from "@backend/lib/catalog/changelog";
import { SHOP_PAGE_SIZE, toSearchSlug, type ShopParams, type ShopSort } from "@backend/lib/catalog/shop-params";
import { pickTranslation } from "@backend/lib/format";
import { getDb } from "@backend/db";

/**
 * Catalog read queries for the storefront. Results are cached (`use cache`) and tagged "catalog";
 * Admin writes (Phase 5) must call revalidateTag("catalog").
 * Only PUBLISHED products are ever returned here.
 *
 * Every product is a complete A→Z pack; categories are the pack's sections (ProductSection).
 */
export const CATALOG_TAG = "catalog";

/** `video` = MP4/WebM preview (rendered with <video>); everything else is an image (PNG/JPG/WebP/GIF/SVG demo). */
export type MediaData = { key: string; isPlaceholder: boolean; width: number | null; height: number | null; video: boolean; mimeType: string };

export type ProductCardData = {
  id: string;
  slug: string;
  type: "FREE" | "PREMIUM";
  priceVnd: number;
  compareAtPriceVnd: number | null;
  isDemoData: boolean;
  assetCount: number;
  sectionCount: number;
  /** Genre names in display order — the first thing buyers compare packs by. */
  genres: string[];
  title: string;
  shortDescription: string;
  thumbnail: MediaData | null;
};

export type ShopResult = { items: ProductCardData[]; total: number; page: number; pageCount: number };

const ORDER_BY: Record<ShopSort, Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: "desc" }, { id: "asc" }],
  bestselling: [{ salesCount: "desc" }, { downloadCount: "desc" }, { id: "asc" }],
  "price-asc": [{ priceVnd: "asc" }, { publishedAt: "desc" }, { id: "asc" }],
  "price-desc": [{ priceVnd: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
};

/**
 * Locales to load where a name must always show (cart, library, orders, Admin, genre/category names): the
 * requested one first, then the others. A pack may be written in one language only (DECISIONS #39), so a pack the
 * customer already holds still gets a title from whichever language exists (`pickTranslation`).
 */
export function localesFor(locale: Locale): Locale[] {
  return [locale, ...(["vi", "en", "zh"] as const).filter((l) => l !== locale)];
}

/**
 * The storefront shows a pack in a language only once its texts (title, short description, description) are
 * written in it (user request 2026-11-20, DECISIONS #39); elsewhere it is hidden: not listed, not counted, and its
 * page answers 404. Same rule as `packTextLocales` in lib/admin/product-rules.ts (the form trims every text).
 */
export function writtenIn(locale: Locale): Prisma.ProductWhereInput {
  return { translations: { some: { locale, title: { not: "" }, shortDescription: { not: "" }, description: { not: "" } } } };
}

export const MEDIA_SELECT = { storageKey: true, isPlaceholder: true, width: true, height: true, kind: true, mimeType: true } as const;

export function toMedia(m: { storageKey: string; isPlaceholder: boolean; width: number | null; height: number | null; kind: string; mimeType: string }): MediaData {
  return { key: m.storageKey, isPlaceholder: m.isPlaceholder, width: m.width, height: m.height, video: m.kind === "VIDEO", mimeType: m.mimeType };
}

function cardInclude(locale: Locale) {
  return {
    translations: { where: { locale }, select: { locale: true, title: true, shortDescription: true } },
    media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
    _count: { select: { sections: true } },
    genres: {
      select: {
        genre: {
          select: { sortOrder: true, translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } } },
        },
      },
    },
  } satisfies Prisma.ProductInclude;
}

type CardRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof cardInclude> }>;

function toCard(row: CardRow, locale: Locale): ProductCardData {
  const t = pickTranslation(row.translations, locale);
  const thumb = row.media[0];
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    priceVnd: row.priceVnd,
    compareAtPriceVnd: row.compareAtPriceVnd,
    isDemoData: row.isDemoData,
    assetCount: row.assetCount,
    sectionCount: row._count.sections,
    genres: [...row.genres]
      .sort((a, b) => a.genre.sortOrder - b.genre.sortOrder)
      .map((g) => pickTranslation(g.genre.translations, locale)?.name ?? ""),
    title: t?.title ?? row.slug,
    shortDescription: t?.shortDescription ?? "",
    thumbnail: thumb ? toMedia(thumb) : null,
  };
}

/** Published packs written in `locale` (what a shopper in that language can see). */
export function visibleIn(locale: Locale): Prisma.ProductWhereInput {
  return { status: "PUBLISHED", ...writtenIn(locale) };
}

/** Builds the Prisma filter from validated shop params (exported for tests). */
export function shopWhere(p: Omit<ShopParams, "sort" | "page">, locale: Locale): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [visibleIn(locale)];
  if (p.q) {
    const slug = toSearchSlug(p.q);
    // Search the texts the shopper can read (their language), plus the slug.
    and.push({
      OR: [
        { translations: { some: { locale, title: { contains: p.q, mode: "insensitive" } } } },
        { translations: { some: { locale, shortDescription: { contains: p.q, mode: "insensitive" } } } },
        ...(slug ? [{ slug: { contains: slug } }] : []),
      ],
    });
  }
  if (p.genre) and.push({ genres: { some: { genre: { slug: p.genre } } } });
  if (p.style) and.push({ artStyles: { some: { artStyle: { slug: p.style } } } });
  if (p.type) and.push({ type: p.type.toUpperCase() as "FREE" | "PREMIUM" });
  if (p.min !== undefined) and.push({ priceVnd: { gte: p.min } });
  if (p.max !== undefined) and.push({ priceVnd: { lte: p.max } });
  return { AND: and };
}

export async function listShopProducts(locale: Locale, params: ShopParams): Promise<ShopResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);

  const db = getDb();
  const where = shopWhere(params, locale);
  const total = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE));
  const page = Math.min(params.page, pageCount);
  const rows = await db.product.findMany({
    where,
    include: cardInclude(locale),
    orderBy: ORDER_BY[params.sort],
    skip: (page - 1) * SHOP_PAGE_SIZE,
    take: SHOP_PAGE_SIZE,
  });
  return { items: rows.map((r) => toCard(r, locale)), total, page, pageCount };
}

export type FacetOption = { slug: string; name: string; count?: number };
export type ShopFacets = { genres: FacetOption[]; styles: FacetOption[]; highestPrice: number };

/** Filter options with the number of packs visible in `locale` in each (independent of other filters). */
export async function getShopFacets(locale: Locale): Promise<ShopFacets> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);

  const db = getDb();
  const published = visibleIn(locale);
  const tr = { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } } as const;

  const [genres, styles, priceAgg] = await Promise.all([
    db.genre.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, translations: tr, _count: { select: { products: { where: { product: published } } } } },
    }),
    db.artStyle.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, translations: tr, _count: { select: { products: { where: { product: published } } } } },
    }),
    db.product.aggregate({ where: published, _max: { priceVnd: true } }),
  ]);

  const option = (row: { slug: string; translations: { locale: string; name: string }[]; _count: { products: number } }) => ({
    slug: row.slug,
    name: pickTranslation(row.translations, locale)?.name ?? row.slug,
    count: row._count.products,
  });

  return {
    genres: genres.map(option).filter((g) => g.count > 0),
    styles: styles.map(option).filter((s) => s.count > 0),
    highestPrice: priceAgg._max.priceVnd ?? 0,
  };
}

// ───────────────────────────── Product detail ─────────────────────────────

export type PackSection = {
  id: string;
  /** Category slug — also the in-page anchor. */
  slug: string;
  icon: string | null;
  name: string;
  summary: string;
  contentsList: string[];
  assetCount: number;
  resolution: string | null;
  fileFormats: string[];
  media: MediaData[];
};

export type LicenseFlags = {
  commercial: boolean;
  modification: boolean;
  multiProject: boolean;
  redistribution: boolean;
  resale: boolean;
};

export type ProductDetail = Omit<ProductCardData, "thumbnail" | "sectionCount" | "genres"> & {
  description: string;
  fileFormats: string[];
  compatibleSoftware: string[];
  gallery: MediaData[];
  sections: PackSection[];
  genres: FacetOption[];
  styles: FacetOption[];
  version: { version: string; releasedAt: Date | null } | null;
  /** "What's new" (user choice 2026-11-26): released versions, newest first; `note` falls back to another language. */
  releases: PackRelease[];
  license: { code: string; name: string; summary: string; terms: string; flags: LicenseFlags } | null;
};

export type PackRelease = { version: string; releasedAt: Date; note: string | null; current: boolean };

/** How many released versions the pack page lists. */
export const RELEASES_SHOWN = 20;

/** One pack visible in `locale` with its sections, or null (unknown slug / not published / not written in it → 404). */
export async function getProductDetail(locale: Locale, slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);

  const locales = { locale: { in: localesFor(locale) } };
  const nameTr = { where: locales, select: { locale: true, name: true } } as const;
  const row = await getDb().product.findFirst({
    where: { slug, ...visibleIn(locale) },
    include: {
      // The pack's own texts: this language only, never another one mixed in.
      translations: { where: { locale } },
      media: { where: { sectionId: null }, orderBy: { sortOrder: "asc" }, select: MEDIA_SELECT },
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          // A section added later and not written in this language yet shows without its summary.
          translations: { where: { locale } },
          category: { select: { slug: true, iconKey: true, translations: nameTr } },
          media: { orderBy: { sortOrder: "asc" }, select: MEDIA_SELECT },
        },
      },
      genres: { include: { genre: { select: { slug: true, sortOrder: true, translations: nameTr } } } },
      artStyles: { include: { artStyle: { select: { slug: true, sortOrder: true, translations: nameTr } } } },
      currentVersion: { select: { version: true, releasedAt: true } },
      // A draft version (not released yet) is never shown to customers.
      versions: {
        where: { releasedAt: { not: null } },
        orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
        take: RELEASES_SHOWN,
        select: { id: true, version: true, releasedAt: true, changelog: true },
      },
      licenses: {
        where: { isDefault: true },
        take: 1,
        include: { license: { include: { translations: { where: locales } } } },
      },
    },
  });
  if (!row) return null;

  const t = pickTranslation(row.translations, locale);
  const lic = row.licenses[0]?.license;
  const licT = lic ? pickTranslation(lic.translations, locale) : undefined;
  const named = (x: { slug: string; sortOrder: number; translations: { locale: string; name: string }[] }) => ({
    slug: x.slug,
    name: pickTranslation(x.translations, locale)?.name ?? x.slug,
    sortOrder: x.sortOrder,
  });
  const bySort = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    priceVnd: row.priceVnd,
    compareAtPriceVnd: row.compareAtPriceVnd,
    isDemoData: row.isDemoData,
    assetCount: row.assetCount,
    title: t?.title ?? row.slug,
    shortDescription: t?.shortDescription ?? "",
    description: t?.description ?? "",
    fileFormats: row.fileFormats,
    compatibleSoftware: row.compatibleSoftware,
    gallery: row.media.map(toMedia),
    sections: row.sections.map((s) => {
      const st = pickTranslation(s.translations, locale);
      return {
        id: s.id,
        slug: s.category.slug,
        icon: s.category.iconKey,
        name: pickTranslation(s.category.translations, locale)?.name ?? s.category.slug,
        summary: st?.summary ?? "",
        contentsList: st?.contentsList ?? [],
        assetCount: s.assetCount,
        resolution: s.resolution,
        fileFormats: s.fileFormats,
        media: s.media.map(toMedia),
      };
    }),
    genres: row.genres.map((g) => named(g.genre)).sort(bySort).map(({ slug, name }) => ({ slug, name })),
    styles: row.artStyles.map((s) => named(s.artStyle)).sort(bySort).map(({ slug, name }) => ({ slug, name })),
    version: row.currentVersion,
    releases: row.versions.map((v) => ({
      version: v.version,
      releasedAt: v.releasedAt!,
      note: changelogText(v.changelog, locale),
      current: v.id === row.currentVersionId,
    })),
    license:
      lic && licT
        ? {
            code: lic.code,
            name: licT.name,
            summary: licT.summary,
            terms: licT.terms,
            flags: {
              commercial: lic.allowCommercial,
              modification: lic.allowModification,
              multiProject: lic.allowMultiProject,
              redistribution: lic.allowRedistribution,
              resale: lic.allowResale,
            },
          }
        : null,
  };
}

/** Other packs visible in `locale` sharing a genre, best-selling first. */
export async function getRelatedProducts(locale: Locale, productId: string, genreSlugs: string[], limit = 3): Promise<ProductCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);

  const rows = await getDb().product.findMany({
    where: { ...visibleIn(locale), id: { not: productId }, genres: { some: { genre: { slug: { in: genreSlugs } } } } },
    include: cardInclude(locale),
    orderBy: ORDER_BY.bestselling,
    take: limit,
  });
  return rows.map((r) => toCard(r, locale));
}

/** Slugs of every pack visible in `locale` (for generateStaticParams). */
export async function listPublishedSlugs(locale: Locale): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  const rows = await getDb().product.findMany({ where: visibleIn(locale), select: { slug: true } });
  return rows.map((r) => r.slug);
}
