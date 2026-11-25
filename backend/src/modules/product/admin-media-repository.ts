import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { getDb } from "@backend/db";

/**
 * Admin media + versions (GĐ5.3). Every write leaves an AuditLog row in the same transaction.
 * Gallery order: the cover (THUMBNAIL) always first, then the rest in the Admin's order (`renumber`).
 */
type Tx = Prisma.TransactionClient;
type MediaKind = "THUMBNAIL" | "IMAGE" | "GIF" | "VIDEO";

const audit = (tx: Tx, adminId: string, action: string, entityId: string, diff?: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { adminId, action, entity: "Product", entityId, diff } });

/** The kind a media item has when it is not the cover. */
export const kindFromMime = (mime: string): Exclude<MediaKind, "THUMBNAIL"> =>
  mime === "image/gif" ? "GIF" : mime.startsWith("video/") ? "VIDEO" : "IMAGE";

const MEDIA_ROW = {
  id: true,
  kind: true,
  storageKey: true,
  mimeType: true,
  width: true,
  height: true,
  sortOrder: true,
  isPlaceholder: true,
  sectionId: true,
} as const;

export function findGallery(productId: string, sectionId: string | null) {
  return getDb().productMedia.findMany({
    where: { productId, sectionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: MEDIA_ROW,
  });
}

export function findMedia(productId: string, mediaId: string) {
  return getDb().productMedia.findFirst({ where: { id: mediaId, productId }, select: MEDIA_ROW });
}

export function findMediaByKey(storageKey: string) {
  return getDb().productMedia.findFirst({ where: { storageKey }, select: { id: true } });
}

export function countGallery(productId: string, sectionId: string | null) {
  return getDb().productMedia.count({ where: { productId, sectionId } });
}

export function sectionBelongs(productId: string, sectionId: string) {
  return getDb()
    .productSection.count({ where: { id: sectionId, productId } })
    .then((n) => n > 0);
}

/** Cover first, then the given order; ids not listed keep their relative order after them. */
async function renumber(tx: Tx, productId: string, sectionId: string | null, order?: string[]) {
  const rows = await tx.productMedia.findMany({
    where: { productId, sectionId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true },
  });
  const ids = order
    ? [
        ...order.filter((id) => rows.some((r) => r.id === id)),
        ...rows.map((r) => r.id).filter((id) => !order.includes(id)),
      ]
    : rows.map((r) => r.id);
  const cover = rows.find((r) => r.kind === "THUMBNAIL")?.id;
  const sorted = cover ? [cover, ...ids.filter((id) => id !== cover)] : ids;
  for (const [i, id] of sorted.entries()) await tx.productMedia.update({ where: { id }, data: { sortOrder: i } });
}

/** The pack gallery has no cover → the first image (not a video) becomes it. */
async function ensureCover(tx: Tx, productId: string) {
  const rows = await tx.productMedia.findMany({
    where: { productId, sectionId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true },
  });
  if (rows.some((r) => r.kind === "THUMBNAIL")) return;
  const first = rows.find((r) => r.kind !== "VIDEO");
  if (first) await tx.productMedia.update({ where: { id: first.id }, data: { kind: "THUMBNAIL" } });
}

export type NewMedia = {
  productId: string;
  sectionId: string | null;
  storageKey: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  filename: string;
};

export function insertMedia(m: NewMedia, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const max = await tx.productMedia.aggregate({
      where: { productId: m.productId, sectionId: m.sectionId },
      _max: { sortOrder: true },
    });
    const row = await tx.productMedia.create({
      data: {
        productId: m.productId,
        sectionId: m.sectionId,
        kind: kindFromMime(m.mimeType),
        storageKey: m.storageKey,
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        isPlaceholder: false,
      },
      select: { id: true },
    });
    if (m.sectionId === null) await ensureCover(tx, m.productId);
    await renumber(tx, m.productId, m.sectionId);
    await tx.product.update({ where: { id: m.productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.media.add", m.productId, {
      mediaId: row.id,
      sectionId: m.sectionId,
      filename: m.filename,
      mimeType: m.mimeType,
    });
    return row.id;
  });
}

export function setCoverRow(productId: string, mediaId: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const old = await tx.productMedia.findMany({
      where: { productId, sectionId: null, kind: "THUMBNAIL" },
      select: { id: true, mimeType: true },
    });
    for (const o of old)
      await tx.productMedia.update({ where: { id: o.id }, data: { kind: kindFromMime(o.mimeType) } });
    await tx.productMedia.update({ where: { id: mediaId }, data: { kind: "THUMBNAIL" } });
    await renumber(tx, productId, null);
    await tx.product.update({ where: { id: productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.media.cover", productId, { mediaId });
  });
}

/** Moving an item is an Admin write like any other: it leaves an AuditLog row (the moved item, from → to). */
export function reorderGallery(
  productId: string,
  sectionId: string | null,
  order: string[],
  adminId: string,
  moved: { mediaId: string; from: number; to: number },
) {
  return getDb().$transaction(async (tx) => {
    await renumber(tx, productId, sectionId, order);
    await tx.product.update({ where: { id: productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.media.reorder", productId, { ...moved, sectionId });
  });
}

export function deleteMediaRow(productId: string, mediaId: string, sectionId: string | null, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const row = await tx.productMedia.delete({ where: { id: mediaId }, select: { storageKey: true } });
    if (sectionId === null) await ensureCover(tx, productId);
    await renumber(tx, productId, sectionId);
    await tx.product.update({ where: { id: productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.media.delete", productId, { mediaId, sectionId, storageKey: row.storageKey });
    return row.storageKey;
  });
}

// ───────────────────────────── Versions & files ─────────────────────────────

const FILE_ROW = {
  id: true,
  filename: true,
  sizeBytes: true,
  sha256: true,
  mimeType: true,
  storageKey: true,
  createdAt: true,
} as const;

export function findVersions(productId: string) {
  return getDb().product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      publishedAt: true,
      currentVersionId: true,
      versions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          version: true,
          changelog: true,
          releasedAt: true,
          createdAt: true,
          files: { orderBy: { createdAt: "asc" }, select: FILE_ROW },
        },
      },
    },
  });
}

export function findVersion(productId: string, versionId: string) {
  return getDb().productVersion.findFirst({
    where: { id: versionId, productId },
    select: {
      id: true,
      version: true,
      releasedAt: true,
      changelog: true,
      _count: { select: { files: true } },
      currentOf: { select: { id: true } },
    },
  });
}

export function findFileByKey(storageKey: string) {
  return getDb().productFile.findUnique({ where: { storageKey }, select: { id: true } });
}

export type NewFile = {
  productId: string;
  versionId: string;
  storageKey: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
};

/** Only into a draft version (checked again inside the transaction: a release may have happened meanwhile). */
export function insertFile(f: NewFile, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const v = await tx.productVersion.findFirst({
      where: { id: f.versionId, productId: f.productId, releasedAt: null },
      select: { id: true },
    });
    if (!v) return null;
    const row = await tx.productFile.create({
      data: {
        versionId: f.versionId,
        storageKey: f.storageKey,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        sha256: f.sha256,
        mimeType: f.mimeType,
      },
      select: { id: true },
    });
    await tx.product.update({ where: { id: f.productId }, data: { updatedAt: new Date() } });
    await audit(tx, adminId, "product.file.add", f.productId, {
      fileId: row.id,
      versionId: f.versionId,
      filename: f.filename,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
    });
    return row.id;
  });
}

export function deleteFileRow(productId: string, fileId: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const file = await tx.productFile.findFirst({
      where: { id: fileId, version: { productId, releasedAt: null } },
      select: { id: true, storageKey: true, filename: true, versionId: true },
    });
    if (!file) return null;
    await tx.productFile.delete({ where: { id: file.id } });
    await audit(tx, adminId, "product.file.delete", productId, {
      fileId,
      versionId: file.versionId,
      filename: file.filename,
    });
    return file.storageKey;
  });
}

export type VersionInput = { version: string; changelog: Record<"vi" | "en" | "zh", string> };
const changelogJson = (c: VersionInput["changelog"]) => (Object.values(c).some((x) => x.trim()) ? c : undefined);

export function insertVersion(productId: string, input: VersionInput, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const row = await tx.productVersion.create({
      data: { productId, version: input.version, changelog: changelogJson(input.changelog) },
      select: { id: true },
    });
    await audit(tx, adminId, "product.version.create", productId, { versionId: row.id, version: input.version });
    return row.id;
  });
}

export function updateVersionRow(productId: string, versionId: string, input: VersionInput, adminId: string) {
  return getDb().$transaction(async (tx) => {
    await tx.productVersion.update({
      where: { id: versionId },
      data: { version: input.version, changelog: changelogJson(input.changelog) ?? Prisma.DbNull },
    });
    await audit(tx, adminId, "product.version.update", productId, { versionId, version: input.version });
  });
}

/** The draft becomes what customers download (the library shows the new number). */
export function releaseVersionRow(productId: string, versionId: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const v = await tx.productVersion.update({
      where: { id: versionId },
      data: { releasedAt: new Date() },
      select: { version: true },
    });
    await tx.product.update({ where: { id: productId }, data: { currentVersionId: versionId } });
    await audit(tx, adminId, "product.version.release", productId, { versionId, version: v.version });
  });
}

export function deleteVersionRow(productId: string, versionId: string, adminId: string) {
  return getDb().$transaction(async (tx) => {
    const files = await tx.productFile.findMany({ where: { versionId }, select: { storageKey: true } });
    const v = await tx.productVersion.delete({ where: { id: versionId }, select: { version: true } }); // its files cascade
    await audit(tx, adminId, "product.version.delete", productId, { versionId, version: v.version });
    return files.map((f) => f.storageKey);
  });
}

/** Every stored object of a pack (to clean the buckets after the pack itself is deleted). */
export async function findPackObjects(productId: string) {
  const [media, files] = await Promise.all([
    getDb().productMedia.findMany({ where: { productId }, select: { storageKey: true } }),
    getDb().productFile.findMany({ where: { version: { productId } }, select: { storageKey: true } }),
  ]);
  return { media: media.map((m) => m.storageKey), files: files.map((f) => f.storageKey) };
}
