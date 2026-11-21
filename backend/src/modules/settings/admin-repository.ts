import "server-only";
import type { ExtraDownloadsSettings } from "@backend/lib/admin/settings-rules";
import { getDb } from "@backend/db";

/** Last few saves of Settings, newest first (who and when; the diff holds before → after). */
export function findSettingsHistory(take: number) {
  return getDb().auditLog.findMany({
    where: { entity: "ShopSettings", action: "settings.update" },
    orderBy: { createdAt: "desc" },
    take,
    select: { createdAt: true, diff: true, admin: { select: { email: true } } },
  });
}

/**
 * Save the "more downloads" offer (step 5.6) with its AuditLog row in one transaction. Returns false when nothing
 * changed (no row, no log). Two Admins saving at once: the last save wins, both are logged.
 */
export function saveShopSettingsRows(
  value: ExtraDownloadsSettings,
  defaults: ExtraDownloadsSettings,
  adminId: string,
): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const row = await tx.shopSettings.findUnique({ where: { id: 1 } });
    const before = row ? { count: row.extraDownloadsCount, priceVnd: row.extraDownloadsPriceVnd } : defaults;
    if (before.count === value.count && before.priceVnd === value.priceVnd) return false; // same as in use
    const data = { extraDownloadsCount: value.count, extraDownloadsPriceVnd: value.priceVnd };
    await tx.shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await tx.auditLog.create({
      data: {
        adminId,
        action: "settings.update",
        entity: "ShopSettings",
        entityId: "1",
        diff: { extraDownloads: { before, after: value } },
      },
    });
    return true;
  });
}
