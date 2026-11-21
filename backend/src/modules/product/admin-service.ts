import "server-only";
import type { Locale } from "@backend/i18n/routing";
import {
  canDeletePack,
  draftInput,
  draftSlug,
  missingWhilePublished,
  packTextLocales,
  publishBlockers,
  sectionMissingWhilePublished,
  type ProductFormInput,
  type PublishBlocker,
  type SectionFormInput,
} from "@backend/lib/admin/product-rules";
import { pickTranslation } from "@backend/lib/format";
import {
  deleteProductRow,
  deleteSectionRow,
  findAdminProduct,
  findAdminProductsPage,
  findAdminSection,
  findTaxonomy,
  insertProduct,
  insertSection,
  isSlugTaken,
  nextSectionOrder,
  setProductStatus,
  updateProductRow,
  updateSectionRow,
  type AdminProductFilter,
} from "./admin-repository";
import { findPackObjects, removePackObjects } from "./admin-media-service";
import { toMedia, type MediaData } from "./queries";

/**
 * Admin pack management (GĐ5.2). Callers (admin pages / actions) have already checked Admin rights.
 * Rules: product-rules.ts. Every write is audited (AuditLog) in the repository; the caller refreshes the
 * storefront cache (updateTag("catalog")).
 */
export const ADMIN_PRODUCTS_PAGE_SIZE = 20;

export type AdminProductRow = {
  id: string;
  slug: string;
  title: string;
  type: "FREE" | "PREMIUM";
  status: "DRAFT" | "PUBLISHED" | "HIDDEN";
  priceVnd: number;
  isFeatured: boolean;
  isDemoData: boolean;
  salesCount: number;
  downloadCount: number;
  updatedAt: Date;
  thumbnail: MediaData | null;
  sectionCount: number;
  hasFile: boolean;
  /** Locales (of vi/en/zh) whose pack texts are not written yet: the storefront hides the pack in them. */
  missingLocales: Locale[];
};

const LOCALES: Locale[] = ["vi", "en", "zh"];

export async function listAdminProducts(filter: AdminProductFilter, locale: Locale, page: number) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findAdminProductsPage(filter, locale, (safePage - 1) * ADMIN_PRODUCTS_PAGE_SIZE, ADMIN_PRODUCTS_PAGE_SIZE);
  const items: AdminProductRow[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: pickTranslation(p.translations, locale)?.title || p.slug,
    type: p.type,
    status: p.status,
    priceVnd: p.priceVnd,
    isFeatured: p.isFeatured,
    isDemoData: p.isDemoData,
    salesCount: p.salesCount,
    downloadCount: p.downloadCount,
    updatedAt: p.updatedAt,
    thumbnail: p.media[0] ? toMedia(p.media[0]) : null,
    sectionCount: p._count.sections,
    hasFile: (p.currentVersion?._count.files ?? 0) > 0,
    missingLocales: LOCALES.filter((l) => !packTextLocales(p.translations).includes(l)),
  }));
  return { items, total, page: safePage, pageCount: Math.max(1, Math.ceil(total / ADMIN_PRODUCTS_PAGE_SIZE)) };
}

export type AdminTaxonomy = {
  genres: { id: string; name: string }[];
  styles: { id: string; name: string }[];
  categories: { id: string; slug: string; icon: string | null; name: string }[];
};

export async function getAdminTaxonomy(locale: Locale): Promise<AdminTaxonomy> {
  const [genres, styles, categories] = await findTaxonomy(locale);
  const name = (t: { locale: string; name: string }[], fallback: string) => pickTranslation(t as { locale: Locale; name: string }[], locale)?.name ?? fallback;
  return {
    genres: genres.map((g) => ({ id: g.id, name: name(g.translations, g.slug) })),
    styles: styles.map((s) => ({ id: s.id, name: name(s.translations, s.slug) })),
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, icon: c.iconKey, name: name(c.translations, c.slug) })),
  };
}

export type AdminProductDetail = NonNullable<Awaited<ReturnType<typeof findAdminProduct>>> & {
  blockers: PublishBlocker[];
  canDelete: boolean;
  /** Slug and type are fixed once the pack has been on sale. */
  locked: boolean;
};

export async function getAdminProduct(id: string, locale: Locale): Promise<AdminProductDetail | null> {
  if (!id || id.length > 64) return null;
  const [p, taxonomy] = await Promise.all([findAdminProduct(id), getAdminTaxonomy(locale)]);
  if (!p) return null;
  const categoryName = (categoryId: string) => taxonomy.categories.find((c) => c.id === categoryId)?.name ?? categoryId;
  return {
    ...p,
    blockers: publishBlockers({
      translations: p.translations,
      sections: p.sections.map((s) => ({ name: categoryName(s.categoryId), translations: s.translations })),
      hasFile: (p.currentVersion?._count.files ?? 0) > 0,
      hasCover: p.media.length > 0,
    }),
    canDelete: canDeletePack({ orderItems: p._count.orderItems, entitlements: p._count.entitlements, downloadCredits: p._count.downloadCredits }),
    locked: p.publishedAt !== null,
  };
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: "notFound" | "locked"; fields?: undefined } | { ok: false; fields: Record<string, string> };

export async function createAdminProduct(input: ProductFormInput, adminId: string): Promise<SaveResult> {
  if (await isSlugTaken(input.slug)) return { ok: false, fields: { slug: "slugTaken" } };
  return { ok: true, id: await insertProduct(input, adminId) };
}

/** "New pack": an empty draft with a free temporary link, opened at once in the full editor (`draftInput`). */
export async function createAdminDraft(adminId: string): Promise<{ ok: true; id: string } | { ok: false; error: "generic" }> {
  for (let i = 0; i < 5; i++) {
    const result = await createAdminProduct(draftInput(draftSlug()), adminId);
    if (result.ok) return result;
  }
  return { ok: false, error: "generic" };
}

export async function updateAdminProduct(id: string, input: ProductFormInput, adminId: string): Promise<SaveResult> {
  const current = await findAdminProduct(id);
  if (!current) return { ok: false, error: "notFound" };
  // Once published: links (slug) and what was sold (type) stay as they are.
  const locked = current.publishedAt !== null;
  if (locked && (input.slug !== current.slug || input.type !== current.type)) return { ok: false, error: "locked" };
  if (input.slug !== current.slug && (await isSlugTaken(input.slug, id))) return { ok: false, fields: { slug: "slugTaken" } };
  if (current.status === "PUBLISHED") {
    const missing = missingWhilePublished(input, packTextLocales(current.translations));
    if (Object.keys(missing).length > 0) return { ok: false, fields: missing };
  }
  const diff = Object.fromEntries(
    (
      [
        ["slug", current.slug, input.slug],
        ["type", current.type, input.type],
        ["priceVnd", current.priceVnd, input.priceVnd],
        ["compareAtPriceVnd", current.compareAtPriceVnd, input.compareAtPriceVnd],
        ["isFeatured", current.isFeatured, input.isFeatured],
      ] as const
    )
      .filter(([, a, b]) => a !== b)
      .map(([k, a, b]) => [k, { from: a, to: b }]),
  );
  await updateProductRow(id, input, input.type !== current.type, adminId, diff);
  return { ok: true, id };
}

export type StatusResult = { ok: true } | { ok: false; error: "notFound" | "blocked" | "notDraftable" };

/** Publish (only without blockers), hide, or back to draft (only a pack that was never published). */
export async function setAdminProductStatus(id: string, status: "DRAFT" | "PUBLISHED" | "HIDDEN", adminId: string, locale: Locale): Promise<StatusResult> {
  const p = await getAdminProduct(id, locale);
  if (!p) return { ok: false, error: "notFound" };
  if (p.status === status) return { ok: true };
  if (status === "PUBLISHED" && p.blockers.length > 0) return { ok: false, error: "blocked" };
  if (status === "DRAFT" && p.publishedAt !== null) return { ok: false, error: "notDraftable" };
  await setProductStatus(id, status, status === "PUBLISHED" && p.publishedAt === null, adminId);
  return { ok: true };
}

export async function deleteAdminProduct(id: string, adminId: string): Promise<{ ok: true } | { ok: false; error: "notFound" | "inUse" }> {
  const p = await findAdminProduct(id);
  if (!p) return { ok: false, error: "notFound" };
  if (!canDeletePack({ orderItems: p._count.orderItems, entitlements: p._count.entitlements, downloadCredits: p._count.downloadCredits })) {
    return { ok: false, error: "inUse" };
  }
  const objects = await findPackObjects(id);
  await deleteProductRow(id, p.slug, adminId);
  await removePackObjects(objects); // after the rows: a failure leaves an orphan object, never a broken pack
  return { ok: true };
}

export async function addAdminSection(productId: string, categoryId: string, adminId: string, locale: Locale) {
  const [p, taxonomy] = await Promise.all([findAdminProduct(productId), getAdminTaxonomy(locale)]);
  if (!p || !taxonomy.categories.some((c) => c.id === categoryId)) return { ok: false as const, error: "notFound" as const };
  if (p.sections.some((s) => s.categoryId === categoryId)) return { ok: false as const, error: "exists" as const };
  const max = await nextSectionOrder(productId);
  const sectionId = await insertSection(productId, categoryId, (max._max.sortOrder ?? -1) + 1, adminId);
  return { ok: true as const, sectionId };
}

export async function getAdminSection(productId: string, sectionId: string) {
  if (!productId || !sectionId || productId.length > 64 || sectionId.length > 64) return null;
  return findAdminSection(productId, sectionId);
}

export async function updateAdminSection(productId: string, sectionId: string, input: SectionFormInput, adminId: string) {
  const [section, product] = await Promise.all([findAdminSection(productId, sectionId), findAdminProduct(productId)]);
  if (!section || !product) return { ok: false as const, error: "notFound" as const };
  if (product.status === "PUBLISHED") {
    const missing = sectionMissingWhilePublished(input);
    if (Object.keys(missing).length > 0) return { ok: false as const, fields: missing };
  }
  await updateSectionRow(productId, sectionId, input, adminId);
  return { ok: true as const };
}

export async function deleteAdminSection(productId: string, sectionId: string, adminId: string) {
  const p = await findAdminProduct(productId);
  if (!p || !p.sections.some((s) => s.id === sectionId)) return { ok: false as const, error: "notFound" as const };
  // A pack on sale keeps at least one section (it was published with it).
  if (p.status === "PUBLISHED" && p.sections.length === 1) return { ok: false as const, error: "lastSection" as const };
  await deleteSectionRow(productId, sectionId, adminId);
  return { ok: true as const };
}
