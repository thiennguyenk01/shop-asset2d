import "server-only";
import { getDb } from "@backend/db";

/** The single shop settings row (id = 1, step 5.6); null until the Admin saves Settings once. */
export function findShopSettings() {
  return getDb().shopSettings.findUnique({
    where: { id: 1 },
    select: { extraDownloadsCount: true, extraDownloadsPriceVnd: true, updatedAt: true },
  });
}
