import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_EXTRA_DOWNLOADS } from "@backend/lib/download/rules";
import type { ExtraDownloadsSettings } from "@backend/lib/admin/settings-rules";
import { readContactSettings, visibleContacts, type ContactLink } from "@backend/lib/contact/channels";
import { findContactChannels, findShopSettings } from "./repository";

/** Cache tag of the contact channels: Admin → Settings → Contact calls updateTag with it. */
export const CONTACT_TAG = "contact";

/**
 * The channels the floating chat button lists (user choice 2026-11-26): on and filled, in the Admin's order.
 * Every store page shows the button, so the list is cached until the Admin saves it again.
 */
export async function getContactChannels(): Promise<ContactLink[]> {
  "use cache";
  cacheTag(CONTACT_TAG);
  cacheLife("days");
  return visibleContacts(readContactSettings(await findContactChannels()));
}

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
