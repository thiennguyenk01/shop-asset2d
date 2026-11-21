import "server-only";
import { decideDownload, DOWNLOAD_WINDOW_MS, freeDownloadsLeft, freeQuota, type DownloadBlock } from "@backend/lib/download/rules";
import { signedDownloadUrl } from "@backend/storage";
import {
  countPackDownloads,
  countPackDownloadsMany,
  countRecentDownloads,
  findDownloadTarget,
  findEntitlement,
  findExtraDownloads,
  findExtraDownloadsMany,
  recordDownload,
} from "./repository";

/**
 * The ONE way to get a sellable file (CLAUDE.md §7). Order of work:
 * 1. load the pack + its current file from the database (never from client input beyond the ids);
 * 2. decide with the pure rules (published, signed in, Premium → active entitlement, Free → downloads left,
 *    hourly anti-bot cap);
 * 3. record the download (and the free claim) in a transaction that re-checks the free quota under a lock;
 * 4. only then mint a ~60 s signed URL for that one file. The URL is returned to the caller once and
 *    never stored or rendered into HTML.
 */
export type DownloadRequest = {
  productId: string;
  /** Optional: a specific file of the CURRENT version (packs have one file today). */
  fileId?: string | null;
  /** From the session only; null = guest (always refused). */
  userId: string | null;
  userAgent: string | null;
};

export type DownloadResult =
  | {
      ok: true;
      url: string;
      filename: string;
      inLibrary: boolean;
      claimed: boolean;
      /** Free pack: downloads left after this one; Premium: null (unlimited). */
      remaining: number | null;
    }
  | { ok: false; reason: DownloadBlock };

export async function requestDownload(req: DownloadRequest, now = new Date()): Promise<DownloadResult> {
  const product = await findDownloadTarget(req.productId);
  const files = product?.currentVersion?.files ?? [];
  const file = req.fileId ? files.find((f) => f.id === req.fileId) : files[0];
  const licenseId = product?.licenses[0]?.licenseId ?? null;
  const userId = req.userId;

  const [entitlement, recentDownloads, packDownloads, extraDownloads] =
    userId && product
      ? await Promise.all([
          findEntitlement(userId, product.id),
          countRecentDownloads(userId, new Date(now.getTime() - DOWNLOAD_WINDOW_MS)),
          countPackDownloads(userId, product.id),
          findExtraDownloads(userId, product.id),
        ])
      : [null, 0, 0, 0];

  const decision = decideDownload({
    product,
    hasFile: !!file,
    signedIn: !!userId,
    entitlement: entitlement ? { revoked: entitlement.revokedAt !== null } : null,
    recentDownloads,
    packDownloads,
    extraDownloads,
  });
  if (!decision.ok) return decision;
  // A free claim needs the pack's terms to snapshot; without them the download still works, unsaved.
  const claim = decision.claim && licenseId ? { licenseId } : null;

  const recorded = await recordDownload({
    userId: userId!,
    productId: product!.id,
    fileId: file!.id,
    userAgent: req.userAgent,
    claim,
    quota: decision.quota,
  });
  // Another click took the last download between the check and the lock.
  if (!recorded.ok) return { ok: false, reason: "quotaExhausted" };

  return {
    ok: true,
    url: await signedDownloadUrl(file!.storageKey, file!.filename),
    filename: file!.filename,
    inLibrary: decision.inLibrary && (!decision.claim || !!claim),
    claimed: recorded.claimed,
    remaining: decision.quota === null ? null : Math.max(0, decision.quota - recorded.used),
  };
}

/** What the pack page / library show for a free pack: downloads left out of the total. */
export type FreeDownloadQuota = { left: number; total: number };

export async function getFreeDownloadQuota(userId: string, productId: string): Promise<FreeDownloadQuota> {
  const [used, extra] = await Promise.all([countPackDownloads(userId, productId), findExtraDownloads(userId, productId)]);
  return { left: freeDownloadsLeft(used, extra), total: freeQuota(extra) };
}

/** Same, for many free packs at once (library rows). */
export async function getFreeDownloadQuotas(userId: string, productIds: string[]): Promise<Map<string, FreeDownloadQuota>> {
  const [used, extra] = await Promise.all([countPackDownloadsMany(userId, productIds), findExtraDownloadsMany(userId, productIds)]);
  return new Map(
    productIds.map((id) => {
      const bought = extra.get(id) ?? 0;
      return [id, { left: freeDownloadsLeft(used.get(id) ?? 0, bought), total: freeQuota(bought) }];
    }),
  );
}
