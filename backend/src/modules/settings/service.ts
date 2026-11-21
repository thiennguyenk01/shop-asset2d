import "server-only";
import { DEFAULT_EXTRA_DOWNLOADS } from "@backend/lib/download/rules";
import type { ExtraDownloadsSettings } from "@backend/lib/admin/settings-rules";
import { findShopSettings } from "./repository";

/**
 * Shop settings (step 5.6, DECISIONS #35). Read fresh on every call (one primary-key row): the storefront shows,
 * and a new "more downloads" order charges, what the Admin saved last. Orders already placed keep their own
 * count and price (OrderItem snapshot).
 */
export async function getExtraDownloadsOffer(): Promise<ExtraDownloadsSettings> {
  const row = await findShopSettings();
  return row
    ? { count: row.extraDownloadsCount, priceVnd: row.extraDownloadsPriceVnd }
    : { count: DEFAULT_EXTRA_DOWNLOADS.count, priceVnd: DEFAULT_EXTRA_DOWNLOADS.priceVnd };
}
