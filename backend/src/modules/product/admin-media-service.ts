import "server-only";
import { randomBytes } from "node:crypto";
import {
  checkNewVersion,
  imageSize,
  MAX_FILES_PER_VERSION,
  MAX_MEDIA_PER_GALLERY,
  planUpload,
  sniffFormat,
  suggestNextVersion,
  UPLOAD_FORMATS,
  type UploadTarget,
  type VersionError,
} from "@backend/lib/admin/upload-rules";
import { getEnv } from "@backend/env";
import { getStorage, uploadTarget, type Bucket } from "@backend/storage";
import { safeFilename } from "@backend/storage/file-token";
import { signUploadTicket, verifyUploadTicket } from "@backend/storage/upload-ticket";
import { findAdminProduct } from "./admin-repository";
import {
  countGallery,
  deleteFileRow,
  deleteMediaRow,
  deleteVersionRow,
  findFileByKey,
  findGallery,
  findMedia,
  findMediaByKey,
  findPackObjects,
  findVersion,
  findVersions,
  insertFile,
  insertMedia,
  insertVersion,
  releaseVersionRow,
  reorderGallery,
  sectionBelongs,
  setCoverRow,
  updateVersionRow,
  type VersionInput,
} from "./admin-media-repository";

/**
 * Admin media + downloadable files + versions (GĐ5.3). Callers have checked Admin rights; this layer checks
 * everything about the pack / section / version again (ids come from the browser).
 *
 * Upload = start (ticket: server picks bucket + key + limits) → the browser PUTs the bytes → finish (the bytes are
 * sniffed, hashed, then the row is created). A file that is not what its name says is deleted at once.
 *
 * Versions: at most one DRAFT version per pack (releasedAt null; files can change). A never-published pack's
 * draft is its current version and is released by the first publish; afterwards a new draft is created next to
 * the current version and "Release" makes it current. Released versions never change (what buyers got).
 */
const HEAD_BYTES = 64 * 1024;
const newObjectId = () => randomBytes(12).toString("hex");

/** Remove objects after their rows are gone; a failure only leaves an orphan object, never a broken row. */
async function removeObjects(bucket: Bucket, keys: string[]) {
  const storage = getStorage();
  await Promise.all(keys.map((k) => storage.remove(bucket, k).catch(() => undefined)));
}

// ───────────────────────────── Reading ─────────────────────────────

export type AdminMediaItem = {
  id: string;
  kind: "THUMBNAIL" | "IMAGE" | "GIF" | "VIDEO";
  key: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  isPlaceholder: boolean;
};

export async function getAdminGallery(productId: string, sectionId: string | null): Promise<AdminMediaItem[]> {
  const rows = await findGallery(productId, sectionId);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    key: r.storageKey,
    mimeType: r.mimeType,
    width: r.width,
    height: r.height,
    isPlaceholder: r.isPlaceholder,
  }));
}

export type AdminFile = { id: string; filename: string; sizeBytes: number; sha256: string; createdAt: Date };
export type AdminVersion = {
  id: string;
  version: string;
  releasedAt: Date | null;
  createdAt: Date;
  changelog: Record<"vi" | "en" | "zh", string>;
  files: AdminFile[];
  isCurrent: boolean;
};
export type AdminVersions = {
  current: AdminVersion | null;
  /** The draft next to a released current version (null while the current one is itself the draft). */
  draft: AdminVersion | null;
  history: AdminVersion[];
  /** "New version" is offered when the current version is released and no draft exists. */
  canCreate: boolean;
  suggested: string;
};

function readChangelog(v: unknown): Record<"vi" | "en" | "zh", string> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return { vi: s(o.vi), en: s(o.en), zh: s(o.zh) };
}

export async function getAdminVersions(productId: string): Promise<AdminVersions | null> {
  const p = await findVersions(productId);
  if (!p) return null;
  const all: AdminVersion[] = p.versions.map((v) => ({
    id: v.id,
    version: v.version,
    releasedAt: v.releasedAt,
    createdAt: v.createdAt,
    changelog: readChangelog(v.changelog),
    files: v.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
      createdAt: f.createdAt,
    })),
    isCurrent: v.id === p.currentVersionId,
  }));
  const current = all.find((v) => v.isCurrent) ?? null;
  const draft = all.find((v) => !v.isCurrent && v.releasedAt === null) ?? null;
  return {
    current,
    draft,
    history: all.filter((v) => !v.isCurrent && v.releasedAt !== null),
    canCreate: !!current && current.releasedAt !== null && !draft,
    suggested: suggestNextVersion(all.map((v) => v.version)),
  };
}

// ───────────────────────────── Uploads ─────────────────────────────

export type StartUploadInput = {
  productId: string;
  target: UploadTarget;
  sectionId?: string | null;
  versionId?: string | null;
  filename: string;
  size: number;
};
export type StartUploadError = "notFound" | "badType" | "tooLarge" | "empty" | "badName" | "tooMany" | "versionLocked";
/** `url` + `headers`: where the browser PUTs the bytes and the headers it must send (signed, for R2). */
export type StartUploadResult =
  | { ok: true; ticket: string; url: string; headers: Record<string, string> }
  | { ok: false; error: StartUploadError };

export async function startUpload(input: StartUploadInput, adminId: string): Promise<StartUploadResult> {
  const plan = planUpload(input.target, input.filename, input.size);
  if (!plan.ok) return plan;
  const product = await findAdminProduct(input.productId);
  if (!product) return { ok: false, error: "notFound" };

  let bucket: Bucket;
  let key: string;
  const extra: { s?: string; v?: string } = {};
  if (input.target === "media") {
    const sectionId = input.sectionId || null;
    if (sectionId && !(await sectionBelongs(product.id, sectionId))) return { ok: false, error: "notFound" };
    if ((await countGallery(product.id, sectionId)) >= MAX_MEDIA_PER_GALLERY) return { ok: false, error: "tooMany" };
    bucket = "public";
    key = `packs/${product.id}/media/${newObjectId()}.${plan.ext}`;
    if (sectionId) extra.s = sectionId;
  } else {
    if (!input.versionId) return { ok: false, error: "notFound" };
    const version = await findVersion(product.id, input.versionId);
    if (!version) return { ok: false, error: "notFound" };
    if (version.releasedAt !== null) return { ok: false, error: "versionLocked" };
    if (version._count.files >= MAX_FILES_PER_VERSION) return { ok: false, error: "tooMany" };
    bucket = "private";
    key = `packs/${product.id}/${version.id}/${newObjectId()}.${plan.ext}`;
    extra.v = version.id;
  }
  const ticket = signUploadTicket(
    {
      b: bucket,
      k: key,
      f: plan.format,
      m: plan.maxBytes,
      u: adminId,
      p: product.id,
      n: safeFilename(input.filename),
      ...extra,
    },
    getEnv().AUTH_SECRET,
  );
  const target = await uploadTarget(ticket, bucket, key, input.size);
  return { ok: true, ticket, url: target.url, headers: target.headers };
}

export type FinishUploadError =
  "badTicket" | "missing" | "tooLarge" | "badContent" | "notFound" | "versionLocked" | "tooMany";
export type FinishUploadResult = { ok: true; id: string } | { ok: false; error: FinishUploadError };

export async function finishUpload(token: string, adminId: string): Promise<FinishUploadResult> {
  const t = verifyUploadTicket(token, getEnv().AUTH_SECRET);
  if (!t || t.u !== adminId) return { ok: false, error: "badTicket" };

  // Finishing twice is harmless: the row of that key already exists.
  const existing = t.b === "public" ? await findMediaByKey(t.k) : await findFileByKey(t.k);
  if (existing) return { ok: true, id: existing.id };

  const storage = getStorage();
  const details = await storage.inspect(t.b, t.k, HEAD_BYTES);
  if (!details) return { ok: false, error: "missing" };
  const fail = async (error: FinishUploadError): Promise<FinishUploadResult> => {
    await removeObjects(t.b, [t.k]);
    return { ok: false, error };
  };
  if (details.sizeBytes > t.m) return fail("tooLarge");
  // The real content must be what the extension promised (a renamed page / program is refused).
  if (sniffFormat(details.head) !== t.f) return fail("badContent");
  const info = UPLOAD_FORMATS[t.f];

  try {
    if (t.b === "public") {
      const sectionId = t.s ?? null;
      if (!(await findAdminProduct(t.p)) || (sectionId && !(await sectionBelongs(t.p, sectionId))))
        return fail("notFound");
      if ((await countGallery(t.p, sectionId)) >= MAX_MEDIA_PER_GALLERY) return fail("tooMany");
      const size = imageSize(t.f, details.head);
      const id = await insertMedia(
        {
          productId: t.p,
          sectionId,
          storageKey: t.k,
          mimeType: info.mime,
          width: size?.width ?? null,
          height: size?.height ?? null,
          filename: t.n,
        },
        adminId,
      );
      return { ok: true, id };
    }
    const id = await insertFile(
      {
        productId: t.p,
        versionId: t.v ?? "",
        storageKey: t.k,
        filename: t.n,
        sizeBytes: details.sizeBytes,
        sha256: details.sha256,
        mimeType: info.mime,
      },
      adminId,
    );
    return id ? { ok: true, id } : fail("versionLocked");
  } catch {
    return fail("notFound");
  }
}

// ───────────────────────────── Gallery ─────────────────────────────

type Simple = { ok: true } | { ok: false; error: "notFound" | "notCover" };

export async function setAdminCover(productId: string, mediaId: string, adminId: string): Promise<Simple> {
  const m = await findMedia(productId, mediaId);
  if (!m || m.sectionId !== null) return { ok: false, error: "notFound" };
  if (m.kind === "VIDEO") return { ok: false, error: "notCover" };
  if (m.kind !== "THUMBNAIL") await setCoverRow(productId, mediaId, adminId);
  return { ok: true };
}

/** Move one item one step earlier / later in its gallery (the cover stays first). */
export async function moveAdminMedia(productId: string, mediaId: string, direction: "up" | "down"): Promise<Simple> {
  const m = await findMedia(productId, mediaId);
  if (!m) return { ok: false, error: "notFound" };
  const ids = (await findGallery(productId, m.sectionId)).map((r) => r.id);
  const i = ids.indexOf(mediaId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorderGallery(productId, m.sectionId, ids);
  return { ok: true };
}

export async function deleteAdminMedia(productId: string, mediaId: string, adminId: string): Promise<Simple> {
  const m = await findMedia(productId, mediaId);
  if (!m) return { ok: false, error: "notFound" };
  const key = await deleteMediaRow(productId, mediaId, m.sectionId, adminId);
  // The object goes too (a demo placeholder is recreated by the next `db:seed`).
  await removeObjects("public", [key]);
  return { ok: true };
}

// ───────────────────────────── Files & versions ─────────────────────────────

export async function deleteAdminFile(
  productId: string,
  fileId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" }> {
  const key = await deleteFileRow(productId, fileId, adminId);
  if (!key) return { ok: false, error: "notFound" };
  await removeObjects("private", [key]);
  return { ok: true };
}

export type VersionSaveError = VersionError | "notFound" | "notAllowed" | "versionLocked";
export type VersionSaveResult =
  { ok: true; id: string } | { ok: false; error?: VersionSaveError; fields?: Record<string, string> };

function versionFields(input: VersionInput, others: string[]): Record<string, string> | null {
  const fields: Record<string, string> = {};
  const versionError = checkNewVersion(input.version, others);
  if (versionError) fields.version = versionError;
  // "What's new" is optional and one language is enough (user request 2026-11-21; was: all 3 once written).
  return Object.keys(fields).length > 0 ? fields : null;
}

/** A new draft next to the released current version (one draft at a time). */
export async function createAdminVersion(
  productId: string,
  input: VersionInput,
  adminId: string,
): Promise<VersionSaveResult> {
  const versions = await getAdminVersions(productId);
  if (!versions) return { ok: false, error: "notFound" };
  if (!versions.canCreate) return { ok: false, error: "notAllowed" };
  const all = [versions.current, ...versions.history].filter((v): v is AdminVersion => !!v).map((v) => v.version);
  const fields = versionFields(input, all);
  if (fields) return { ok: false, fields };
  return { ok: true, id: await insertVersion(productId, input, adminId) };
}

/** Number / "what's new" of a draft version. */
export async function updateAdminVersion(
  productId: string,
  versionId: string,
  input: VersionInput,
  adminId: string,
): Promise<VersionSaveResult> {
  const versions = await getAdminVersions(productId);
  const all = versions
    ? [versions.current, versions.draft, ...versions.history].filter((v): v is AdminVersion => !!v)
    : [];
  const target = all.find((v) => v.id === versionId);
  if (!versions || !target) return { ok: false, error: "notFound" };
  if (target.releasedAt !== null) return { ok: false, error: "versionLocked" };
  const fields = versionFields(
    input,
    all.filter((v) => v.id !== versionId).map((v) => v.version),
  );
  if (fields) return { ok: false, fields };
  await updateVersionRow(productId, versionId, input, adminId);
  return { ok: true, id: versionId };
}

export type ReleaseError = "notFound" | "noFile" | "notAllowed";

/** Make the draft the version customers download. Needs at least one file. */
export async function releaseAdminVersion(
  productId: string,
  versionId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: ReleaseError }> {
  const versions = await getAdminVersions(productId);
  if (!versions?.draft || versions.draft.id !== versionId)
    return { ok: false, error: versions ? "notAllowed" : "notFound" };
  if (versions.draft.files.length === 0) return { ok: false, error: "noFile" };
  await releaseVersionRow(productId, versionId, adminId);
  return { ok: true };
}

/** Throw away a draft next to the current version (with its files). */
export async function deleteAdminVersion(
  productId: string,
  versionId: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "notAllowed" }> {
  const versions = await getAdminVersions(productId);
  if (!versions?.draft || versions.draft.id !== versionId)
    return { ok: false, error: versions ? "notAllowed" : "notFound" };
  const keys = await deleteVersionRow(productId, versionId, adminId);
  await removeObjects("private", keys);
  return { ok: true };
}

/** Called by the pack delete: what to remove from the buckets once the rows are gone. */
export { findPackObjects };
export async function removePackObjects(objects: { media: string[]; files: string[] }) {
  await Promise.all([removeObjects("public", objects.media), removeObjects("private", objects.files)]);
}
