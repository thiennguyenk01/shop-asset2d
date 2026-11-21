import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productFormData, productFormSchema, sectionFormData, sectionFormSchema, type ProductFormInput } from "@backend/lib/admin/product-rules";
import {
  addAdminSection,
  createAdminDraft,
  createAdminProduct,
  deleteAdminProduct,
  deleteAdminSection,
  getAdminProduct,
  getAdminTaxonomy,
  setAdminProductStatus,
  updateAdminProduct,
  updateAdminSection,
} from "@backend/modules/product/admin-service";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * Admin pack management (GĐ5.2) against the real services and the dev database: drafts, the publish gate,
 * what is locked once on sale, section totals, delete vs hide, and the audit trail.
 */
const tag = newTag();
let admin: { id: string };

function input(over: Record<string, string | string[]> = {}): ProductFormInput {
  const f = new FormData();
  const base: Record<string, string | string[]> = {
    slug: `it-${tag}-pack`,
    type: "PREMIUM",
    priceVnd: "250000",
    compareAtPriceVnd: "",
    resolution: "64×64",
    compatibleSoftware: "Unity, Godot",
    "vi.title": "Bộ thử",
    "vi.shortDescription": "Ngắn",
    "vi.description": "Dài",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) for (const x of [v].flat()) f.append(k, x);
  const r = productFormSchema.safeParse(productFormData(f));
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}
const allLocales = {
  "en.title": "Test pack",
  "en.shortDescription": "Short",
  "en.description": "Long",
  "zh.title": "测试包",
  "zh.shortDescription": "简短",
  "zh.description": "详细",
};
function sectionInput(over: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ assetCount: "12", sortOrder: "0", resolution: "", fileFormats: "png, gif", "vi.summary": "Tóm tắt", ...over })) f.append(k, v);
  const r = sectionFormSchema.safeParse(sectionFormData(f));
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}
const audits = (entityId: string) => db().auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" }, select: { action: true, adminId: true } });

beforeAll(async () => {
  admin = await createUser(tag, "admin");
});

afterAll(async () => {
  await cleanup(tag);
  expect(await db().product.count({ where: { slug: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Admin packs (GĐ5.2)", () => {
  let id = "";

  it("creates a draft with its default terms by type and an empty first version; the slug must be unique", async () => {
    const created = await createAdminProduct(input(), admin.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    id = created.id;
    const row = await db().product.findUniqueOrThrow({
      where: { id },
      select: { status: true, isDemoData: true, publishedAt: true, licenses: { select: { isDefault: true, license: { select: { code: true } } } }, currentVersion: { select: { version: true } } },
    });
    expect(row).toMatchObject({ status: "DRAFT", isDemoData: false, publishedAt: null, currentVersion: { version: "1.0.0" } });
    expect(row.licenses).toEqual([{ isDefault: true, license: { code: "PREMIUM" } }]);
    expect(await createAdminProduct(input(), admin.id)).toEqual({ ok: false, fields: { slug: "slugTaken" } });
    expect((await audits(id)).map((a) => a.action)).toEqual(["product.create"]);
  });

  it("“New pack” is an empty FREE draft with a temporary link and version 1.0.0, deletable at once (2026-11-21)", async () => {
    const draft = await createAdminDraft(admin.id);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    try {
      const p = await getAdminProduct(draft.id, "vi");
      expect(p).toMatchObject({ status: "DRAFT", type: "FREE", priceVnd: 0, publishedAt: null });
      expect(p!.slug).toMatch(/^bo-moi-[a-z0-9]{4}$/);
      expect(p!.currentVersion?.version).toBe("1.0.0");
      expect(p!.blockers.map((b) => b.key).sort()).toEqual(["noCover", "noFile", "noLanguage", "noSections"]);
    } finally {
      expect(await deleteAdminProduct(draft.id, admin.id)).toEqual({ ok: true });
    }
  });

  it("can be published once ONE language is fully written (DECISIONS #39), with a section, a cover and a file", async () => {
    // Only VI is written, and there is no section yet.
    let p = await getAdminProduct(id, "vi");
    expect(p?.blockers.map((b) => b.key)).toEqual(["noSections", "noCover", "noFile"]);
    expect(await setAdminProductStatus(id, "PUBLISHED", admin.id, "vi")).toEqual({ ok: false, error: "blocked" });

    const taxonomy = await getAdminTaxonomy("vi");
    const [c1, c2] = taxonomy.categories;
    const s1 = await addAdminSection(id, c1.id, admin.id, "vi");
    const s2 = await addAdminSection(id, c2.id, admin.id, "vi");
    expect(await addAdminSection(id, c1.id, admin.id, "vi")).toEqual({ ok: false, error: "exists" });
    if (!s1.ok || !s2.ok) throw new Error("sections");
    p = await getAdminProduct(id, "vi");
    expect(p?.blockers.map((b) => b.key)).toEqual(["noLanguage", "noCover", "noFile"]);

    // VI summary on one section, EN on the other: still no language written from end to end.
    await updateAdminSection(id, s1.sectionId, sectionInput(), admin.id);
    await updateAdminSection(id, s2.sectionId, sectionInput({ "vi.summary": "", "en.summary": "Summary", assetCount: "30", fileFormats: "PNG, WAV" }), admin.id);
    expect((await getAdminProduct(id, "vi"))?.blockers.map((b) => b.key)).toEqual(["noLanguage", "noCover", "noFile"]);

    await updateAdminSection(id, s2.sectionId, sectionInput({ assetCount: "30", fileFormats: "PNG, WAV" }), admin.id);
    p = await getAdminProduct(id, "vi");
    // Pack totals follow the sections.
    expect(p?.assetCount).toBe(42);
    expect(p?.fileFormats.sort()).toEqual(["GIF", "PNG", "WAV"]);
    expect(p?.blockers).toEqual([{ key: "noCover" }, { key: "noFile" }]);

    // Cover and file come from uploads (5.3, backend/tests/integration/admin-media.test.ts); here they are added directly.
    await db().productMedia.create({ data: { productId: id, kind: "THUMBNAIL", storageKey: `it/${tag}/cover.png`, mimeType: "image/png" } });
    const version = await db().productVersion.findFirstOrThrow({ where: { productId: id } });
    await db().productFile.create({ data: { versionId: version.id, storageKey: `it/${tag}/pack.zip`, filename: "pack.zip", sizeBytes: 1, sha256: "0".repeat(64), mimeType: "application/zip" } });
    expect((await getAdminProduct(id, "vi"))?.blockers).toEqual([]);

    expect(await setAdminProductStatus(id, "PUBLISHED", admin.id, "vi")).toEqual({ ok: true });
    const row = await db().product.findUniqueOrThrow({ where: { id }, select: { status: true, publishedAt: true } });
    expect(row.status).toBe("PUBLISHED");
    expect(row.publishedAt).not.toBeNull();
  });

  it("once on sale: link and type are locked, one language stays written, the last section stays", async () => {
    expect(await updateAdminProduct(id, input({ slug: `it-${tag}-renamed` }), admin.id)).toEqual({ ok: false, error: "locked" });
    expect(await updateAdminProduct(id, input({ type: "FREE", priceVnd: "0" }), admin.id)).toEqual({ ok: false, error: "locked" });
    // VI is the only language written: it cannot be emptied (the pack would vanish from every language).
    expect(await updateAdminProduct(id, input({ "vi.title": "" }), admin.id)).toEqual({ ok: false, fields: { "translations.vi.title": "required" } });
    // EN and ZH are added later; then VI may be emptied (the pack is hidden in VI only), and written again.
    expect((await updateAdminProduct(id, input(allLocales), admin.id)).ok).toBe(true);
    expect((await updateAdminProduct(id, input({ ...allLocales, "vi.title": "" }), admin.id)).ok).toBe(true);
    expect((await getAdminProduct(id, "vi"))?.status).toBe("PUBLISHED");
    // Price and featured flag can still change.
    expect((await updateAdminProduct(id, input({ ...allLocales, priceVnd: "199000", isFeatured: "on" }), admin.id)).ok).toBe(true);
    expect(await db().product.findUniqueOrThrow({ where: { id }, select: { priceVnd: true, isFeatured: true } })).toEqual({ priceVnd: 199_000, isFeatured: true });

    const p = await getAdminProduct(id, "vi");
    const [first, second] = p!.sections;
    // A section keeps its summary in at least one language.
    expect(await updateAdminSection(id, first.id, sectionInput({ "vi.summary": "" }), admin.id)).toEqual({
      ok: false,
      fields: { "translations.vi.summary": "required", "translations.en.summary": "required", "translations.zh.summary": "required" },
    });
    expect((await updateAdminSection(id, first.id, sectionInput({ "vi.summary": "", "zh.summary": "摘要" }), admin.id)).ok).toBe(true);
    expect((await deleteAdminSection(id, second.id, admin.id)).ok).toBe(true);
    expect(await deleteAdminSection(id, first.id, admin.id)).toEqual({ ok: false, error: "lastSection" });
    expect((await getAdminProduct(id, "vi"))?.assetCount).toBe(12);
  });

  it("hide and show again; a published pack never goes back to draft", async () => {
    expect(await setAdminProductStatus(id, "HIDDEN", admin.id, "vi")).toEqual({ ok: true });
    expect(await setAdminProductStatus(id, "DRAFT", admin.id, "vi")).toEqual({ ok: false, error: "notDraftable" });
    expect(await setAdminProductStatus(id, "PUBLISHED", admin.id, "vi")).toEqual({ ok: true });
  });

  it("a pack someone owns cannot be deleted (hide it); an untouched draft can", async () => {
    const buyer = await createUser(tag, "owner");
    const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
    await db().entitlement.create({ data: { userId: buyer.id, productId: id, licenseId: license.id, source: "ADMIN_GRANT" } });
    expect(await deleteAdminProduct(id, admin.id)).toEqual({ ok: false, error: "inUse" });
    expect(await db().product.count({ where: { id } })).toBe(1);

    const draft = await createAdminProduct(input({ slug: `it-${tag}-draft`, type: "FREE", priceVnd: "0" }), admin.id);
    if (!draft.ok) throw new Error("draft");
    expect((await db().productLicense.findFirstOrThrow({ where: { productId: draft.id }, select: { license: { select: { code: true } } } })).license.code).toBe("FREE");
    expect(await deleteAdminProduct(draft.id, admin.id)).toEqual({ ok: true });
    expect(await db().product.count({ where: { id: draft.id } })).toBe(0);
    expect((await audits(draft.id)).map((a) => a.action)).toEqual(["product.create", "product.delete"]);
  });

  it("every change is in the audit log, by the admin who made it", async () => {
    const log = await audits(id);
    expect(log.every((a) => a.adminId === admin.id)).toBe(true);
    expect(log.map((a) => a.action)).toEqual(
      expect.arrayContaining(["product.create", "product.update", "product.section.add", "product.section.update", "product.publish", "product.hide", "product.section.delete"]),
    );
  });
});
