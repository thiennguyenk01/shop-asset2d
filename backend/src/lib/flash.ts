/**
 * One-shot "flash" message carried across a server redirect or a full re-render (e.g. "Signed in." after
 * the login action redirects, or "Password changed." after the session cookie is re-issued and Next
 * re-renders the whole tree). The action sets a short-lived, non-HttpOnly cookie holding only a key; the
 * client takes it once (`takeFlash`) and shows the translated toast. Keys only, never user data.
 */
export const FLASH_COOKIE = "flash";
export const FLASH_KEYS = [
  "signedIn",
  "registered",
  "passwordChanged",
  "passwordSet",
  "passwordReset",
  "packCreated",
  "packDeleted",
  "sectionAdded",
  "sectionDeleted",
  "couponCreated",
  "couponDeleted",
] as const;
export type FlashKey = (typeof FLASH_KEYS)[number];

/** Translation key (full path) of each flash message. */
export const FLASH_MESSAGE = {
  signedIn: "auth.login.success",
  registered: "auth.register.success",
  passwordChanged: "account.passwordChanged",
  passwordSet: "account.setPassword.done",
  passwordReset: "auth.reset.success",
  packCreated: "adminProducts.flash.created",
  packDeleted: "adminProducts.flash.deleted",
  sectionAdded: "adminProducts.flash.sectionAdded",
  sectionDeleted: "adminProducts.flash.sectionDeleted",
  couponCreated: "adminCoupons.flash.created",
  couponDeleted: "adminCoupons.flash.deleted",
} as const satisfies Record<FlashKey, string>;

export function isFlashKey(v: unknown): v is FlashKey {
  return typeof v === "string" && (FLASH_KEYS as readonly string[]).includes(v);
}

/** Browser only: read the flash cookie and delete it, so whoever takes it first shows the toast once. */
export function takeFlash(): FlashKey | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!match) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
  const key = decodeURIComponent(match.slice(FLASH_COOKIE.length + 1));
  return isFlashKey(key) ? key : null;
}
