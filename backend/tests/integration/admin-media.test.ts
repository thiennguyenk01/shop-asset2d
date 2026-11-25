import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productFormData, productFormSchema, sectionFormData, sectionFormSchema, type ProductFormInput } from "@backend/lib/admin/product-rules";
import { requestDownload } from "@backend/modules/download/service";
import {
  createAdminVersion,
  deleteAdminFile,
  deleteAdminMedia,
  finishUpload,
  findPackObjects,
  getAdminGallery,
  getAdminVersions,
  moveAdminMedia,
  releaseAdminVersion,
  removePackObjects,
  setAdminCover,
  startUpload,
  type StartUploadInput,
} from "@backend/modules/product/admin-media-service";
import { addAdminSection, createAdminProduct, deleteAdminProduct, getAdminProduct, getAdminTaxonomy, setAdminProductStatus, updateAdminSection } from "@backend/modules/product/admin-service";
import { getStorage } from "@backend/storage";
import { verifyFileToken } from "@backend/storage/file-token";
import { verifyUploadTicket } from "@backend/storage/upload-ticket";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * Admin uploads + versions (GĐ5.3) with the real services, the real local storage driver and the dev database.
 * The browser's PUT is replaced by writing the bytes where the ticket says (what the upload route does).
 */
const tag = newTag();
let admin: { id: string };
let other: { id: string };
let packId = "";

const PNG = (w: number, h: number) => {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return new Uint8Array(b);
};
const ZIP = (text: string) => new Uint8Array(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(text)]));
const MP4 = new Uint8Array(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(32)]));

/** start → "PUT" → finish, like the uploader component. */
async function upload(input: Omit<StartUploadInput, "size">, body: Uint8Array, by = admin.id) {
  const start = await startUpload({ ...input, size: body.byteLength }, by);
  if (!start.ok) return start;
  const ticket = verifyUploadTicket(start.ticket, process.env.AUTH_SECRET)!;
  await getStorage().put(ticket.b, ticket.k, body);
  return { ...(await finishUpload(start.ticket, by)), key: ticket.k, bucket: ticket.b };
}

function input(over: Record<string, string> = {}): ProductFormInput {
  const f = new FormData();
  const all = { slug: `it-${tag}-${over.label ?? "pack"}`, type: "PREMIUM", priceVnd: "100000", compareAtPriceVnd: "", resolution: "", compatibleSoftware: "" };
  for (const l of ["vi", "en", "zh"]) Object.assign(all, { [`${l}.title`]: `T ${l}`, [`${l}.shortDescription`]: "S", [`${l}.description`]: "D" });
  for (const [k, v] of Object.entries({ ...all, ...over })) if (k !== "label") f.append(k, v);
  const r = productFormSchema.safeParse(productFormData(f));
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}

beforeAll(async () => {
  admin = await createUser(tag, "admin");
  other = await createUser(tag, "other-admin");
  const created = await createAdminProduct(input(), admin.id);
  if (!created.ok) throw new Error("create");
  packId = created.id;
  const [category] = (await getAdminTaxonomy("vi")).categories;
  const s = await addAdminSection(packId, category.id, admin.id, "vi");
  if (!s.ok) throw new Error("section");
  const f = new FormData();
  for (const [k, v] of Object.entries({ assetCount: "10", sortOrder: "0", resolution: "", fileFormats: "png", "vi.summary": "a", "en.summary": "b", "zh.summary": "c" })) f.append(k, v);
  await updateAdminSection(packId, s.sectionId, sectionFormSchema.parse(sectionFormData(f)), admin.id);
});

afterAll(async () => {
  for (const p of await db().product.findMany({ where: { slug: { startsWith: `it-${tag}-` } }, select: { id: true } })) await removePackObjects(await findPackObjects(p.id));
  await cleanup(tag);
  expect(await db().product.count({ where: { slug: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Admin uploads & versions (GĐ5.3)", () => {
  it("the pack needs a cover and a file before it can go on sale", async () => {
    expect((await getAdminProduct(packId, "vi"))?.blockers).toEqual([{ key: "noCover" }, { key: "noFile" }]);
  });

  it("pictures: the first image becomes the cover, size is read from the file, order can change", async () => {
    const a = await upload({ productId: packId, target: "media", filename: "a.png" }, PNG(640, 360));
    const v = await upload({ productId: packId, target: "media", filename: "trailer.mp4" }, MP4);
    const b = await upload({ productId: packId, target: "media", filename: "b.png" }, PNG(32, 32));
    expect([a.ok, v.ok, b.ok]).toEqual([true, true, true]);
    let g = await getAdminGallery(packId, null);
    expect(g.map((m) => m.kind)).toEqual(["THUMBNAIL", "VIDEO", "IMAGE"]);
    expect(g[0]).toMatchObject({ width: 640, height: 360, mimeType: "image/png", isPlaceholder: false });
    expect(g[0].key).toMatch(new RegExp(`^packs/${packId}/media/[0-9a-f]{24}\\.png$`));
    expect(await getStorage().exists("public", g[0].key)).toBe(true);

    // A video cannot be the cover; "b" can, and the cover always comes first.
    expect(await setAdminCover(packId, g[1].id, admin.id)).toEqual({ ok: false, error: "notCover" });
    expect(await setAdminCover(packId, g[2].id, admin.id)).toEqual({ ok: true });
    g = await getAdminGallery(packId, null);
    expect(g.map((m) => m.kind)).toEqual(["THUMBNAIL", "IMAGE", "VIDEO"]);
    await moveAdminMedia(packId, g[2].id, "up", admin.id);
    expect((await getAdminGallery(packId, null)).map((m) => m.kind)).toEqual(["THUMBNAIL", "VIDEO", "IMAGE"]);

    // Deleting the cover promotes the next image (not the video) and removes the object.
    const cover = (await getAdminGallery(packId, null))[0];
    expect(await deleteAdminMedia(packId, cover.id, admin.id)).toEqual({ ok: true });
    expect(await getStorage().exists("public", cover.key)).toBe(false);
    g = await getAdminGallery(packId, null);
    expect(g.map((m) => m.kind)).toEqual(["THUMBNAIL", "VIDEO"]);
    expect(g[0].width).toBe(640);
  });

  it("refuses a renamed file (content ≠ extension) and deletes it at once", async () => {
    const r = await upload({ productId: packId, target: "media", filename: "evil.png" }, new TextEncoder().encode("<!doctype html><script>alert(1)</script>"));
    expect(r.ok).toBe(false);
    if (r.ok || !("key" in r)) throw new Error("expected a finished upload");
    expect(r).toMatchObject({ ok: false, error: "badContent" });
    expect(await getStorage().exists("public", r.key)).toBe(false);
    // SVG is never even given a ticket.
    expect(await startUpload({ productId: packId, target: "media", filename: "logo.svg", size: 10 }, admin.id)).toEqual({ ok: false, error: "badType" });
  });

  it("a ticket only works for the Admin it was issued to, and only for the pack it names", async () => {
    const start = await startUpload({ productId: packId, target: "media", filename: "c.png", size: 64 }, admin.id);
    if (!start.ok) throw new Error("start");
    const t = verifyUploadTicket(start.ticket, process.env.AUTH_SECRET)!;
    expect(start.url).toBe(`/api/admin/uploads/${start.ticket}`);
    await getStorage().put(t.b, t.k, PNG(8, 8));
    expect(await finishUpload(start.ticket, other.id)).toEqual({ ok: false, error: "badTicket" });
    expect(await finishUpload("forged.ticket", admin.id)).toEqual({ ok: false, error: "badTicket" });
    await getStorage().remove(t.b, t.k);
    // A section of this pack only; unknown packs get nothing.
    expect(await startUpload({ productId: packId, target: "media", sectionId: "nope", filename: "x.png", size: 10 }, admin.id)).toEqual({ ok: false, error: "notFound" });
    expect(await startUpload({ productId: "nope", target: "media", filename: "x.png", size: 10 }, admin.id)).toEqual({ ok: false, error: "notFound" });
  });

  it("the sellable file goes to the PRIVATE bucket with its SHA-256; the pack can then be published", async () => {
    const versions = await getAdminVersions(packId);
    expect(versions).toMatchObject({ current: { version: "1.0.0", releasedAt: null }, draft: null, canCreate: false });
    const body = ZIP("version one");
    const r = await upload({ productId: packId, target: "file", versionId: versions!.current!.id, filename: "Pack v1.zip" }, body);
    expect(r).toMatchObject({ ok: true, bucket: "private" });
    const file = await db().productFile.findFirstOrThrow({ where: { versionId: versions!.current!.id } });
    expect(file).toMatchObject({ filename: "Pack v1.zip", sizeBytes: body.byteLength, mimeType: "application/zip", sha256: createHash("sha256").update(body).digest("hex") });
    expect(await getStorage().exists("private", file.storageKey)).toBe(true);
    expect(await getStorage().exists("public", file.storageKey)).toBe(false);

    expect((await getAdminProduct(packId, "vi"))?.blockers).toEqual([]);
    expect(await setAdminProductStatus(packId, "PUBLISHED", admin.id, "vi")).toEqual({ ok: true });
  });

  it("publishing released version 1.0.0: its files are locked", async () => {
    const versions = (await getAdminVersions(packId))!;
    expect(versions.current?.releasedAt).not.toBeNull();
    expect(versions.canCreate).toBe(true);
    expect(await startUpload({ productId: packId, target: "file", versionId: versions.current!.id, filename: "more.zip", size: 10 }, admin.id)).toEqual({ ok: false, error: "versionLocked" });
    expect(await deleteAdminFile(packId, versions.current!.files[0].id, admin.id)).toEqual({ ok: false, error: "notFound" });
  });

  it("a new version: number rules, a draft with its file, then Release → owners download the new file", async () => {
    const owner = await createUser(tag, "owner");
    const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
    await db().entitlement.create({ data: { userId: owner.id, productId: packId, licenseId: license.id, source: "ADMIN_GRANT" } });
    const oldFile = (await getAdminVersions(packId))!.current!.files[0];

    const empty = { vi: "", en: "", zh: "" };
    expect(await createAdminVersion(packId, { version: "1.0.0", changelog: empty }, admin.id)).toEqual({ ok: false, fields: { version: "versionNotNewer" } });
    // "What's new" in one language is enough (user request 2026-11-21).
    const created = await createAdminVersion(packId, { version: "1.1.0", changelog: { ...empty, vi: "Thêm 20 icon" } }, admin.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await getAdminVersions(packId))!.draft!.changelog).toEqual({ vi: "Thêm 20 icon", en: "", zh: "" });
    // One draft at a time.
    expect(await createAdminVersion(packId, { version: "1.2.0", changelog: empty }, admin.id)).toEqual({ ok: false, error: "notAllowed" });
    expect(await releaseAdminVersion(packId, created.id, admin.id)).toEqual({ ok: false, error: "noFile" });

    // Until the release, owners still get 1.0.0.
    const oldKey = (await db().productFile.findUniqueOrThrow({ where: { id: oldFile.id } })).storageKey;
    let dl = await requestDownload({ productId: packId, userId: owner.id, userAgent: null });
    expect(dl.ok && verifyFileToken(dl.url.split("/").pop(), process.env.AUTH_SECRET)?.k).toBe(oldKey);

    const up = await upload({ productId: packId, target: "file", versionId: created.id, filename: "Pack v1.1.zip" }, ZIP("version 1.1"));
    expect(up.ok).toBe(true);
    expect(await releaseAdminVersion(packId, created.id, admin.id)).toEqual({ ok: true });

    const versions = (await getAdminVersions(packId))!;
    expect(versions.current).toMatchObject({ id: created.id, version: "1.1.0" });
    expect(versions.current?.releasedAt).not.toBeNull();
    expect(versions.history.map((v) => v.version)).toEqual(["1.0.0"]);
    dl = await requestDownload({ productId: packId, userId: owner.id, userAgent: null });
    expect(dl.ok && dl.filename).toBe("Pack v1.1.zip");
    // The old version's file is not downloadable any more (not in the current version).
    expect(await requestDownload({ productId: packId, fileId: oldFile.id, userId: owner.id, userAgent: null })).toEqual({ ok: false, reason: "notFound" });
  });

  it("every step is in the audit log", async () => {
    const actions = (await db().auditLog.findMany({ where: { entityId: packId }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["product.media.add", "product.media.cover", "product.media.reorder", "product.media.delete", "product.file.add", "product.version.create", "product.version.release"]),
    );
  });

  it("deleting a never-sold draft pack also removes its pictures and files from storage", async () => {
    const created = await createAdminProduct(input({ label: "throwaway" }), admin.id);
    if (!created.ok) throw new Error("create");
    const pic = await upload({ productId: created.id, target: "media", filename: "p.png" }, PNG(4, 4));
    const v = (await getAdminVersions(created.id))!.current!;
    const zip = await upload({ productId: created.id, target: "file", versionId: v.id, filename: "z.zip" }, ZIP("z"));
    if (!pic.ok || !zip.ok || !("key" in pic) || !("key" in zip)) throw new Error("uploads");
    expect(await deleteAdminProduct(created.id, admin.id)).toEqual({ ok: true });
    expect(await getStorage().exists("public", pic.key)).toBe(false);
    expect(await getStorage().exists("private", zip.key)).toBe(false);
  });
});
