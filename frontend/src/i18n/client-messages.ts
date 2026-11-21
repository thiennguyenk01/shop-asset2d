/**
 * Which translations travel to the browser (GĐ7.3). Without a `messages` prop, NextIntlClientProvider sends the
 * WHOLE message file (~66 KB in Vietnamese, Admin texts included) inside every page's HTML. Only the parts that
 * client components ("use client") read are sent: server components translate on the server.
 *
 * - SITE_CLIENT_MESSAGES: the root layout (every page).
 * - ADMIN_CLIENT_MESSAGES: the Admin area adds its own provider (a nested provider replaces the messages, so it
 *   repeats the site set).
 * A path is a top-level namespace ("cart") or a sub-tree ("adminProducts.flash": the flash toast in the root
 * layout shows Admin confirmations). frontend/tests/unit/client-messages.test.ts scans every "use client" file and fails
 * when a namespace it reads is missing here — add it to the right list.
 */
export const SITE_CLIENT_MESSAGES = [
  "account",
  "admin", // the account menu's "Admin" entry (small namespace: sent whole)
  "auth",
  "cart",
  "checkout",
  "common",
  "contactChat",
  "designSystem",
  "download",
  "extraDownloads",
  "header",
  "library",
  "localeSwitcher",
  "nav",
  "notifications",
  "product",
  "productPage",
  "shop",
  // FLASH_MESSAGE (backend/src/lib/flash.ts) keys shown by <FlashToast /> in the root layout.
  "adminProducts.flash",
  "adminCoupons.flash",
] as const;

export const ADMIN_CLIENT_MESSAGES = [
  ...SITE_CLIENT_MESSAGES,
  "adminCoupons",
  "adminMedia",
  "adminOrders",
  "adminProducts",
  "adminSettings",
  "adminTransfers",
  "adminUsers",
] as const;

type Messages = Record<string, unknown>;

/** A copy of `messages` holding only the given paths (a missing path is skipped: the i18n check guards keys). */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  const out: Messages = {};
  for (const path of paths) {
    const parts = path.split(".");
    let src: unknown = messages;
    for (const p of parts) src = src && typeof src === "object" ? (src as Messages)[p] : undefined;
    if (src === undefined) continue;
    let dst = out;
    for (const p of parts.slice(0, -1)) {
      if (!dst[p] || typeof dst[p] !== "object") dst[p] = {};
      dst = dst[p] as Messages;
    }
    dst[parts[parts.length - 1]] = src;
  }
  return out;
}
