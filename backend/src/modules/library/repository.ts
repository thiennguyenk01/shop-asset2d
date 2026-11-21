import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";

/** Active (not revoked) entitlements of a user, newest first, with what the library card shows. */
export function findLibraryEntitlements(userId: string, locale: Locale) {
  return getDb().entitlement.findMany({
    where: { userId, revokedAt: null },
    orderBy: { grantedAt: "desc" },
    select: {
      source: true,
      grantedAt: true,
      order: { select: { code: true } },
      license: { select: { allowCommercial: true, allowModification: true, allowMultiProject: true, allowRedistribution: true, allowResale: true } },
      product: {
        select: {
          id: true,
          slug: true,
          type: true,
          status: true,
          isDemoData: true,
          translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
          media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
          currentVersion: { select: { version: true, releasedAt: true } },
        },
      },
    },
  });
}

/** Last download time per pack for this user. */
export async function findLastDownloads(userId: string, productIds: string[]): Promise<Map<string, Date>> {
  if (productIds.length === 0) return new Map();
  const rows = await getDb().downloadLog.groupBy({
    by: ["productId"],
    where: { userId, productId: { in: productIds } },
    _max: { createdAt: true },
  });
  return new Map(rows.flatMap((r) => (r._max.createdAt ? [[r.productId, r._max.createdAt] as const] : [])));
}

/** The user's most recent downloads (history list). */
export function findDownloadHistory(userId: string, locale: Locale, take: number) {
  return getDb().downloadLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      createdAt: true,
      file: { select: { filename: true, version: { select: { version: true } } } },
      product: {
        select: { slug: true, translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } } },
      },
    },
  });
}

export async function hasActiveEntitlement(userId: string, productId: string): Promise<boolean> {
  const row = await getDb().entitlement.findUnique({ where: { userId_productId: { userId, productId } }, select: { revokedAt: true } });
  return !!row && row.revokedAt === null;
}
