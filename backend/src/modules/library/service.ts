import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { pickTranslation } from "@backend/lib/format";
import { getFreeDownloadQuotas, type FreeDownloadQuota } from "@backend/modules/download/service";
import { toMedia, type MediaData } from "@backend/modules/product/queries";
import { findDownloadHistory, findLastDownloads, findLibraryEntitlements, hasActiveEntitlement } from "./repository";

/**
 * My Library (CLAUDE.md §5.7): every pack the user owns — free packs saved on download (FREE_CLAIM),
 * bought packs (PURCHASE, Phase 4.2) and admin grants — plus the download history.
 */
export type LibraryItem = {
  productId: string;
  slug: string;
  title: string;
  type: "FREE" | "PREMIUM";
  source: "PURCHASE" | "FREE_CLAIM" | "ADMIN_GRANT";
  /** The order a purchased pack came from (link to its detail). */
  orderCode: string | null;
  isDemoData: boolean;
  thumbnail: MediaData | null;
  acquiredAt: Date;
  version: { version: string; releasedAt: Date | null } | null;
  lastDownloadedAt: Date | null;
  /** HIDDEN / DRAFT packs stay listed but cannot be downloaded (CLAUDE.md §7). */
  downloadable: boolean;
  /** Free pack: downloads left of the account's quota (CLAUDE.md §5); Premium: null (unlimited). */
  freeDownloads: FreeDownloadQuota | null;
  benefits: { commercial: boolean; modification: boolean; multiProject: boolean; redistribution: boolean; resale: boolean };
};

export type DownloadHistoryEntry = { id: string; at: Date; slug: string; title: string; filename: string | null; version: string | null };

export const HISTORY_LIMIT = 20;

export async function getLibrary(userId: string, locale: Locale): Promise<{ items: LibraryItem[]; history: DownloadHistoryEntry[] }> {
  const [rows, history] = await Promise.all([findLibraryEntitlements(userId, locale), findDownloadHistory(userId, locale, HISTORY_LIMIT)]);
  const productIds = rows.map((r) => r.product.id);
  const freeIds = rows.filter((r) => r.product.type === "FREE").map((r) => r.product.id);
  const [last, quotas] = await Promise.all([findLastDownloads(userId, productIds), getFreeDownloadQuotas(userId, freeIds)]);
  return {
    items: rows.map((r) => ({
      productId: r.product.id,
      slug: r.product.slug,
      title: pickTranslation(r.product.translations, locale)?.title ?? r.product.slug,
      type: r.product.type,
      source: r.source,
      orderCode: r.order?.code ?? null,
      isDemoData: r.product.isDemoData,
      thumbnail: r.product.media[0] ? toMedia(r.product.media[0]) : null,
      acquiredAt: r.grantedAt,
      version: r.product.currentVersion,
      lastDownloadedAt: last.get(r.product.id) ?? null,
      downloadable: r.product.status === "PUBLISHED",
      freeDownloads: quotas.get(r.product.id) ?? null,
      benefits: {
        commercial: r.license.allowCommercial,
        modification: r.license.allowModification,
        multiProject: r.license.allowMultiProject,
        redistribution: r.license.allowRedistribution,
        resale: r.license.allowResale,
      },
    })),
    history: history.map((h) => ({
      id: h.id,
      at: h.createdAt,
      slug: h.product.slug,
      title: pickTranslation(h.product.translations, locale)?.title ?? h.product.slug,
      filename: h.file?.filename ?? null,
      version: h.file?.version.version ?? null,
    })),
  };
}

export function isInLibrary(userId: string, productId: string): Promise<boolean> {
  return hasActiveEntitlement(userId, productId);
}
