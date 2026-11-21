/**
 * Who may download a pack (CLAUDE.md §5, §7; decision 2026-11-14 "giới hạn lượt tải"). Pure, so every branch
 * is unit-tested and the service cannot drift from the documented rules.
 *
 * - The pack must be PUBLISHED and have a file in its current version — otherwise nobody downloads it.
 * - Every download needs an account (guests are asked to sign in, Free included).
 * - PREMIUM: an active (not revoked) entitlement. Unlimited downloads, except an hourly anti-bot cap per
 *   account that a person never reaches (it stops a leaked account being scripted).
 * - FREE: FREE_DOWNLOADS_PER_PACK downloads per account and pack, for life (plus extra downloads bought for
 *   that pack, step 4.6). The first download saves the pack to the library (FREE_CLAIM).
 */
export const FREE_DOWNLOADS_PER_PACK = 2;
/**
 * What one "more downloads" purchase adds to a free pack (step 4.6) when the Admin has not set it yet. The Admin
 * edits it in Settings (step 5.6, DECISIONS #35): read it with getExtraDownloadsOffer() (server/modules/settings).
 */
export const DEFAULT_EXTRA_DOWNLOADS = { count: 2, priceVnd: 10_000 } as const;
/** Anti-bot cap: downloads per account per hour, any pack. */
export const DOWNLOAD_HOURLY_CAP = 100;
export const DOWNLOAD_WINDOW_MS = 60 * 60 * 1000;

export type DownloadBlock = "notFound" | "signInRequired" | "notOwned" | "quotaExhausted" | "rateLimited";

export type DownloadDecision =
  | { ok: false; reason: DownloadBlock }
  | {
      ok: true;
      /** Create a FREE_CLAIM entitlement now (first download of a free pack). */
      claim: boolean;
      /** The pack is (or will be after this download) in the user's library. */
      inLibrary: boolean;
      /** Free pack: the limit this download is counted against (re-checked under a lock when recorded). */
      quota: number | null;
    };

export type DownloadInput = {
  product: { status: "DRAFT" | "PUBLISHED" | "HIDDEN"; type: "FREE" | "PREMIUM" } | null;
  hasFile: boolean;
  signedIn: boolean;
  /** null = the user has no entitlement row for this pack; otherwise whether it was revoked. */
  entitlement: { revoked: boolean } | null;
  /** Downloads by this account in the last hour (all packs). */
  recentDownloads: number;
  /** Downloads of THIS pack by this account, ever. */
  packDownloads: number;
  /** Extra downloads bought for this pack (step 4.6). */
  extraDownloads: number;
};

/** How many downloads of a free pack an account has in total. */
export function freeQuota(extraDownloads: number): number {
  return FREE_DOWNLOADS_PER_PACK + Math.max(0, extraDownloads);
}

/** Downloads left of a free pack (never negative). */
export function freeDownloadsLeft(packDownloads: number, extraDownloads: number): number {
  return Math.max(0, freeQuota(extraDownloads) - packDownloads);
}

export function decideDownload(input: DownloadInput): DownloadDecision {
  const { product } = input;
  if (!product || product.status !== "PUBLISHED" || !input.hasFile) return { ok: false, reason: "notFound" };
  if (!input.signedIn) return { ok: false, reason: "signInRequired" };

  if (product.type === "PREMIUM") {
    if (!input.entitlement || input.entitlement.revoked) return { ok: false, reason: "notOwned" };
    if (input.recentDownloads >= DOWNLOAD_HOURLY_CAP) return { ok: false, reason: "rateLimited" };
    return { ok: true, claim: false, inLibrary: true, quota: null };
  }

  if (freeDownloadsLeft(input.packDownloads, input.extraDownloads) === 0)
    return { ok: false, reason: "quotaExhausted" };
  if (input.recentDownloads >= DOWNLOAD_HOURLY_CAP) return { ok: false, reason: "rateLimited" };
  // A revoked free claim is not silently re-created (an admin took it away); the downloads left stay usable.
  if (input.entitlement?.revoked)
    return { ok: true, claim: false, inLibrary: false, quota: freeQuota(input.extraDownloads) };
  return { ok: true, claim: input.entitlement === null, inLibrary: true, quota: freeQuota(input.extraDownloads) };
}

export type ExtraDownloadsBlock = "notFound" | "notFree";

/**
 * Who may buy more downloads of a pack (step 4.6): only a FREE pack that is on sale (PUBLISHED, with its
 * default terms). Premium packs are unlimited already, so there is nothing to buy. The price and the count
 * always come from the shop settings on the server, never from the client.
 */
export function extraDownloadsBlock(
  product: { status: "DRAFT" | "PUBLISHED" | "HIDDEN"; type: "FREE" | "PREMIUM"; hasTerms: boolean } | null,
): ExtraDownloadsBlock | null {
  if (!product || product.status !== "PUBLISHED" || !product.hasTerms) return "notFound";
  if (product.type !== "FREE") return "notFree";
  return null;
}
