import "server-only";
import { getDb } from "@backend/db";

/** Everything the download decision needs about a pack: status, type, current files, default terms. */
export function findDownloadTarget(productId: string) {
  return getDb().product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      type: true,
      status: true,
      currentVersion: {
        select: { files: { orderBy: { createdAt: "asc" }, select: { id: true, storageKey: true, filename: true } } },
      },
      licenses: { where: { isDefault: true }, take: 1, select: { licenseId: true } },
    },
  });
}

export function findEntitlement(userId: string, productId: string) {
  return getDb().entitlement.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { revokedAt: true },
  });
}

/** Downloads by this account in the window (all packs) — the anti-bot cap. */
export function countRecentDownloads(userId: string, since: Date): Promise<number> {
  return getDb().downloadLog.count({ where: { userId, createdAt: { gte: since } } });
}

/** Downloads of one pack by this account, ever — the free-pack quota. */
export function countPackDownloads(userId: string, productId: string): Promise<number> {
  return getDb().downloadLog.count({ where: { userId, productId } });
}

/** Downloads per pack by this account, ever (library rows). */
export async function countPackDownloadsMany(userId: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await getDb().downloadLog.groupBy({ by: ["productId"], where: { userId, productId: { in: productIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.productId, r._count._all]));
}

/**
 * One transaction:
 * 1. free pack: lock this account + pack and re-count against the quota, so two clicks at the same moment
 *    cannot both take the last download;
 * 2. first free download: the FREE_CLAIM entitlement + claimCount (`skipDuplicates` → made only once);
 * 3. the log row and downloadCount.
 * Returns whether this call created the claim and how many downloads of the pack the account has made now.
 */
export async function recordDownload(input: {
  userId: string;
  productId: string;
  fileId: string;
  userAgent: string | null;
  claim: { licenseId: string } | null;
  /** Free pack: refuse if the account has already made this many downloads of it. */
  quota: number | null;
}): Promise<{ ok: true; claimed: boolean; used: number } | { ok: false }> {
  return getDb().$transaction(async (tx) => {
    let used = 0;
    if (input.quota !== null) {
      // Transaction-scoped lock (released on commit / rollback); fine through the Neon pooler.
      const lockKey = `download:${input.userId}:${input.productId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      used = await tx.downloadLog.count({ where: { userId: input.userId, productId: input.productId } });
      if (used >= input.quota) return { ok: false as const };
    }
    let claimed = false;
    if (input.claim) {
      const { count } = await tx.entitlement.createMany({
        data: [{ userId: input.userId, productId: input.productId, licenseId: input.claim.licenseId, source: "FREE_CLAIM" }],
        skipDuplicates: true,
      });
      claimed = count === 1;
    }
    await tx.downloadLog.create({
      data: { userId: input.userId, productId: input.productId, fileId: input.fileId, userAgent: input.userAgent },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: { downloadCount: { increment: 1 }, ...(claimed ? { claimCount: { increment: 1 } } : {}) },
    });
    return { ok: true as const, claimed, used: used + 1 };
  });
}

/** Extra downloads bought for one free pack (step 4.6). */
export async function findExtraDownloads(userId: string, productId: string): Promise<number> {
  const row = await getDb().downloadCredit.findUnique({ where: { userId_productId: { userId, productId } }, select: { extraDownloads: true } });
  return row?.extraDownloads ?? 0;
}

/** Same, for many packs (library rows). */
export async function findExtraDownloadsMany(userId: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await getDb().downloadCredit.findMany({ where: { userId, productId: { in: productIds } }, select: { productId: true, extraDownloads: true } });
  return new Map(rows.map((r) => [r.productId, r.extraDownloads]));
}
