import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { Locale } from "@backend/i18n/routing";
import type { ProductFormInput, SectionFormInput } from "@backend/lib/admin/product-rules";
import { ADMIN_LOCALES, packTotals } from "@backend/lib/admin/product-rules";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "./queries";

/** Admin pack management (GĐ5.2). Every write also leaves an AuditLog row in the same transaction. */
type Tx = Prisma.TransactionClient;

export type AdminProductFilter = { status?: "DRAFT" | "PUBLISHED" | "HIDDEN"; type?: "FREE" | "PREMIUM"; q?: string };

function listWhere(f: AdminProductFilter): Prisma.ProductWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(q
      ? { OR: [{ slug: { contains: q.toLowerCase() } }, { translations: { some: { title: { contains: q, mode: "insensitive" as const } } } }] }
      : {}),
  };
}

export function findAdminProductsPage(f: AdminProductFilter, locale: Locale, skip: number, take: number) {
  const where = listWhere(f);
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().product.count({ where }),
    getDb().product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        slug: true,
        type: true,
        status: true,
        priceVnd: true,
        isFeatured: true,
        isDemoData: true,
        salesCount: true,
        downloadCount: true,
        updatedAt: true,
        translations: { select: { locale: true, title: true, shortDescription: true, description: true } },
        media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
        _count: { select: { sections: true } },
        currentVersion: { select: { _count: { select: { files: true } } } },
      },
    }),
  ]);
}

const SECTION_SELECT = {
  id: true,
  categoryId: true,
  sortOrder: true,
  assetCount: true,
  resolution: true,
  fileFormats: true,
  translations: { select: { locale: true, summary: true, contentsList: true } },
  category: { select: { slug: true, iconKey: true, sortOrder: true } },
} as const;

export function findAdminProduct(id: string) {
  return getDb().product.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      type: true,
      status: true,
      priceVnd: true,
      compareAtPriceVnd: true,
      isFeatured: true,
      isDemoData: true,
      assetCount: true,
      resolution: true,
      fileFormats: true,
      compatibleSoftware: true,
      publishedAt: true,
      updatedAt: true,
      translations: { select: { locale: true, title: true, shortDescription: true, description: true, contentsList: true } },
      genres: { select: { genreId: true } },
      artStyles: { select: { artStyleId: true } },
      sections: { orderBy: [{ sortOrder: "asc" }, { category: { sortOrder: "asc" } }], select: SECTION_SELECT },
      currentVersion: { select: { version: true, releasedAt: true, _count: { select: { files: true } } } },
      media: { where: { kind: "THUMBNAIL", sectionId: null }, take: 1, select: { id: true } },
      _count: { select: { orderItems: true, entitlements: true, downloadCredits: true } },
    },
  });
}

export function findAdminSection(productId: string, sectionId: string) {
  return getDb().productSection.findFirst({ where: { id: sectionId, productId }, select: SECTION_SELECT });
}

/** Names for the pickers (genres, styles, the 21 categories) in the admin's language, VI as fallback. */
export function findTaxonomy(locale: Locale) {
  const tr = { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } } as const;
  return Promise.all([
    getDb().genre.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, translations: tr } }),
    getDb().artStyle.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, translations: tr } }),
    getDb().category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, iconKey: true, translations: tr } }),
  ]);
}

export async function isSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const row = await getDb().product.findUnique({ where: { slug }, select: { id: true } });
  return !!row && row.id !== exceptId;
}

function audit(tx: Tx, adminId: string, action: string, entityId: string, diff?: Prisma.InputJsonValue) {
  return tx.auditLog.create({ data: { adminId, action, entity: "Product", entityId, diff } });
}

const translationRows = (input: ProductFormInput) =>
  ADMIN_LOCALES.map((locale) => ({ locale, ...input.translations[locale] })).filter(
    (t) => t.title || t.shortDescription || t.description || t.contentsList.length > 0,
  );

/** A new pack: DRAFT, its default terms by type, an empty DRAFT first version (released by the first publish). */
export function insertProduct(input: ProductFormInput, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const license = await tx.license.findUniqueOrThrow({ where: { code: input.type }, select: { id: true } });
    const product = await tx.product.create({
      data: {
        slug: input.slug,
        type: input.type,
        status: "DRAFT",
        priceVnd: input.priceVnd,
        compareAtPriceVnd: input.compareAtPriceVnd,
        isFeatured: input.isFeatured,
        resolution: input.resolution || null,
        compatibleSoftware: input.compatibleSoftware,
        fileFormats: [],
        translations: { create: translationRows(input) },
        genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
        artStyles: { create: input.artStyleIds.map((artStyleId) => ({ artStyleId })) },
        licenses: { create: { licenseId: license.id, isDefault: true } },
        versions: { create: { version: "1.0.0" } },
      },
      select: { id: true, versions: { select: { id: true } } },
    });
    await tx.product.update({ where: { id: product.id }, data: { currentVersionId: product.versions[0].id } });
    await audit(tx, adminId, "product.create", product.id, { slug: input.slug, type: input.type, priceVnd: input.priceVnd });
    return product.id;
  });
}

export function updateProductRow(id: string, input: ProductFormInput, typeChanged: boolean, adminId: string, diff: Prisma.InputJsonValue) {
  return getDb().$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        slug: input.slug,
        type: input.type,
        priceVnd: input.priceVnd,
        compareAtPriceVnd: input.compareAtPriceVnd,
        isFeatured: input.isFeatured,
        resolution: input.resolution || null,
        compatibleSoftware: input.compatibleSoftware,
      },
    });
    const rows = translationRows(input);
    await tx.productTranslation.deleteMany({ where: { productId: id, locale: { notIn: rows.map((r) => r.locale) } } });
    for (const r of rows) {
      const { locale, ...data } = r;
      await tx.productTranslation.upsert({ where: { productId_locale: { productId: id, locale } }, create: { productId: id, ...r }, update: data });
    }
    await tx.productGenre.deleteMany({ where: { productId: id } });
    await tx.productGenre.createMany({ data: input.genreIds.map((genreId) => ({ productId: id, genreId })) });
    await tx.productArtStyle.deleteMany({ where: { productId: id } });
    await tx.productArtStyle.createMany({ data: input.artStyleIds.map((artStyleId) => ({ productId: id, artStyleId })) });
    if (typeChanged) {
      // Terms follow the type (only possible before the first publication).
      const license = await tx.license.findUniqueOrThrow({ where: { code: input.type }, select: { id: true } });
      await tx.productLicense.deleteMany({ where: { productId: id } });
      await tx.productLicense.create({ data: { productId: id, licenseId: license.id, isDefault: true } });
    }
    await audit(tx, adminId, "product.update", id, diff);
  });
}

export function setProductStatus(id: string, status: "DRAFT" | "PUBLISHED" | "HIDDEN", firstPublish: boolean, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id }, data: { status, ...(firstPublish ? { publishedAt: new Date() } : {}) }, select: { currentVersionId: true } });
    // Going on sale releases the current version: from now on its files are what buyers get (GĐ5.3).
    if (status === "PUBLISHED" && p.currentVersionId) {
      await tx.productVersion.updateMany({ where: { id: p.currentVersionId, releasedAt: null }, data: { releasedAt: new Date() } });
    }
    await audit(tx, adminId, `product.${status === "PUBLISHED" ? "publish" : status === "HIDDEN" ? "hide" : "draft"}`, id);
  });
}

export function deleteProductRow(id: string, slug: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { currentVersionId: null } });
    await tx.product.delete({ where: { id } }); // translations, sections, versions, media, logs cascade
    await audit(tx, adminId, "product.delete", id, { slug });
  });
}

/** Pack totals = sum / union of its sections, kept in the same transaction as every section change. */
async function syncTotals(tx: Tx, productId: string) {
  const sections = await tx.productSection.findMany({ where: { productId }, select: { assetCount: true, fileFormats: true } });
  await tx.product.update({ where: { id: productId }, data: packTotals(sections) });
}

const sectionTranslationRows = (input: SectionFormInput) =>
  ADMIN_LOCALES.map((locale) => ({ locale, ...input.translations[locale] })).filter((t) => t.summary || t.contentsList.length > 0);

export function insertSection(productId: string, categoryId: string, sortOrder: number, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const section = await tx.productSection.create({ data: { productId, categoryId, sortOrder, fileFormats: [] }, select: { id: true } });
    await syncTotals(tx, productId);
    await audit(tx, adminId, "product.section.add", productId, { categoryId });
    return section.id;
  });
}

export function updateSectionRow(productId: string, sectionId: string, input: SectionFormInput, adminId: string) {
  return getDb().$transaction(async (tx) => {
    await tx.productSection.update({
      where: { id: sectionId },
      data: { assetCount: input.assetCount, sortOrder: input.sortOrder, resolution: input.resolution || null, fileFormats: input.fileFormats },
    });
    const rows = sectionTranslationRows(input);
    await tx.productSectionTranslation.deleteMany({ where: { sectionId, locale: { notIn: rows.map((r) => r.locale) } } });
    for (const r of rows) {
      const { locale, ...data } = r;
      await tx.productSectionTranslation.upsert({ where: { sectionId_locale: { sectionId, locale } }, create: { sectionId, ...r }, update: data });
    }
    await syncTotals(tx, productId);
    await tx.product.update({ where: { id: productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.section.update", productId, { sectionId, assetCount: input.assetCount });
  });
}

export function deleteSectionRow(productId: string, sectionId: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    await tx.productSection.delete({ where: { id: sectionId } }); // its translations + media cascade
    await syncTotals(tx, productId);
    await audit(tx, adminId, "product.section.delete", productId, { sectionId });
  });
}

export function nextSectionOrder(productId: string) {
  return getDb().productSection.aggregate({ where: { productId }, _max: { sortOrder: true } });
}
