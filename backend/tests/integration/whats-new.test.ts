import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestDownload } from "@backend/modules/download/service";
import { getLibrary } from "@backend/modules/library/service";
import { cleanup, createPack, createUser, db, newTag } from "./fixtures";

/**
 * "What's new" in the library (user choice 2026-11-26): a pack whose current version went out after the owner's last
 * download says "New version" with that version's note; downloading it again clears the flag.
 */
const tag = newTag();
const DAY = 24 * 60 * 60 * 1000;
let owner: { id: string };
let pack: Awaited<ReturnType<typeof createPack>>;

const itemOf = async (locale: "vi" | "en" | "zh" = "vi") =>
  (await getLibrary(owner.id, locale)).items.find((i) => i.productId === pack.id)!;

beforeAll(async () => {
  owner = await createUser(tag, "owner");
  pack = await createPack(tag, "free", { type: "FREE" });
  // Version 1.0.0 went out ten days ago.
  await db().productVersion.updateMany({ where: { productId: pack.id }, data: { releasedAt: new Date(Date.now() - 10 * DAY) } });
});

afterAll(async () => {
  await cleanup(tag);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Library: new version since the last download", () => {
  it("a version downloaded after its release is not flagged", async () => {
    expect((await requestDownload({ productId: pack.id, userId: owner.id, userAgent: "vitest" })).ok).toBe(true);
    const item = await itemOf();
    expect(item.version?.version).toBe("1.0.0");
    expect(item.newVersion).toBeNull();
  });

  it("a version released later is flagged with its note, another language when this one is not written", async () => {
    const v = await db().productVersion.create({
      data: {
        productId: pack.id,
        version: "1.1.0",
        releasedAt: new Date(Date.now() + 1000),
        changelog: { vi: "", en: "Added animations.", zh: "新增动画。" },
        files: {
          create: {
            storageKey: `it/${tag}/free-1.1.zip`,
            filename: "free-1.1.zip",
            sizeBytes: 1,
            sha256: "0".repeat(64),
            mimeType: "application/zip",
          },
        },
      },
      select: { id: true },
    });
    await db().product.update({ where: { id: pack.id }, data: { currentVersionId: v.id } });

    expect((await itemOf("vi")).newVersion).toEqual({ version: "1.1.0", note: "Added animations." });
    expect((await itemOf("zh")).newVersion).toEqual({ version: "1.1.0", note: "新增动画。" });
  });

  it("downloading the new version clears the flag", async () => {
    // The release above is dated one second ahead; download after it.
    await new Promise((r) => setTimeout(r, 1100));
    expect((await requestDownload({ productId: pack.id, userId: owner.id, userAgent: "vitest" })).ok).toBe(true);
    const item = await itemOf();
    expect(item.version?.version).toBe("1.1.0");
    expect(item.newVersion).toBeNull();
  });
});
