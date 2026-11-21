import { execSync } from "node:child_process";
import { expect, sendUploadsWithoutTestIp, test, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin pack management (GĐ5.2–5.3; tabbed editor since 2026-11-21) through the UI: "New pack" opens an empty draft
 * in the full editor, fill it (with a validation error first), add a section,
 * upload the cover + the archive, publish it written in Vietnamese only (hidden in English until English is
 * added, DECISIONS #39), release a version 1.1.0, then delete it.
 * The Admin is made with the real `admin:grant` command and revoked afterwards.
 */
const PASSWORD = "matkhau-e2e-123";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text }).first();
const adminCommand = (action: "grant" | "revoke", email: string) => execSync(`npx tsx backend/scripts/admin-grant.ts ${action} ${email}`, { stdio: "pipe" }).toString();

/** A real (tiny) PNG header and ZIP signature: the server sniffs the content, not the name. */
function PNG(w: number, h: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("e2e demo archive")]);

async function registerAdmin(page: Page): Promise<string> {
  const email = `e2e-admprod-${uid()}@example.test`;
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Quản Trị");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
  adminCommand("grant", email);
  return email;
}

test.describe("Admin: asset packs", () => {
  test("ordinary users get the 404 on the pack pages; the upload endpoint refuses them", async ({ page }) => {
    await page.goto("/vi/admin/products");
    await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
    // No valid ticket → nothing is stored, nothing is revealed.
    for (const ticket of ["x", "eyJiIjoicHJpdmF0ZSJ9.c2ln"]) {
      const r = await page.request.put(`/api/admin/uploads/${ticket}`, { data: ZIP });
      expect(r.status()).toBe(404);
    }
  });

  test("create a draft, fill it, upload cover + archive, publish, release 1.1.0, delete it", async ({ page, context }) => {
    test.setTimeout(240_000);
    await sendUploadsWithoutTestIp(context);
    const email = await registerAdmin(page);
    const slug = `e2e-pack-${uid()}`;
    try {
      await page.goto("/vi/admin/products");
      await expect(page.getByRole("heading", { level: 1, name: vi.adminProducts.listTitle })).toBeVisible();
      await expect(visible(page, "admin-product-row").first()).toBeVisible(); // the seeded packs
      // "New pack" makes an empty draft at once and opens the whole editor (2026-11-21): every tab is there.
      await visible(page, "admin-product-new").click();
      await expect(page).toHaveURL(/\/vi\/admin\/products\/[a-z0-9]+$/);
      await expect(toast(page, vi.adminProducts.flash.created)).toBeVisible();
      await expect(visible(page, "status-panel")).toHaveAttribute("data-status", "DRAFT");
      await expect(visible(page, "admin-product-title")).toHaveText(vi.adminProducts.untitled);
      for (const tab of ["info", "content", "media", "sections", "versions"]) await expect(visible(page, `pack-tab-${tab}`)).toBeVisible();
      const checks = () => visible(page, "pack-checklist").getByTestId("pack-check");
      const check = (key: string) => visible(page, "pack-checklist").locator(`[data-key=${key}]`);
      const missing = () => visible(page, "pack-checklist").locator("[data-state=miss]");
      await expect(checks()).toHaveCount(4);
      await expect(missing()).toHaveCount(4);
      await expect(visible(page, "status-publish")).toBeDisabled();

      // A bad link and a Premium pack without a price come back as field errors; text typed in the other tab is kept.
      const form = visible(page, "product-form");
      await visible(page, "pack-tab-content").click();
      const viPanel = form.getByRole("tabpanel").filter({ visible: true }); // the VI tab is open
      await viPanel.getByLabel(vi.adminProducts.title).fill("Bộ thử E2E");
      await visible(page, "pack-tab-info").click();
      await expect(form.getByLabel(vi.adminProducts.slug)).toHaveValue(/^bo-moi-[a-z0-9]{4}$/);
      await form.getByLabel(vi.adminProducts.slug).fill("Bộ Sai");
      await form.getByText(vi.adminProducts.type.PREMIUM, { exact: true }).click();
      await expect(visible(page, "product-dirty")).toBeVisible();
      await visible(page, "product-save").click();
      await expect(form.getByText(vi.adminProducts.errors.slugFormat)).toBeVisible();
      await expect(form.getByText(vi.adminProducts.errors.pricePremium)).toBeVisible();
      await visible(page, "pack-tab-content").click();
      await expect(viPanel.getByLabel(vi.adminProducts.title)).toHaveValue("Bộ thử E2E");

      await viPanel.getByLabel(vi.adminProducts.shortDescription).fill("Mô tả ngắn");
      await viPanel.getByLabel(vi.adminProducts.description).fill("Mô tả chi tiết của bộ thử.");
      await visible(page, "pack-tab-info").click();
      await form.getByLabel(vi.adminProducts.slug).fill(slug);
      await form.getByLabel(vi.adminProducts.price).fill("150.000");
      // Software from the ready-made chips: the folded card shows what is chosen.
      await visible(page, "spec-software-toggle").click();
      await visible(page, "spec-software").getByText("Unity", { exact: true }).click();
      await visible(page, "spec-software").getByText("Godot", { exact: true }).click();
      await visible(page, "spec-software-toggle").click();
      await expect(visible(page, "spec-software-summary")).toHaveText(/Unity\s*Godot/);
      await visible(page, "product-save").click();
      await expect(toast(page, vi.adminProducts.saved)).toBeVisible();
      await expect(visible(page, "product-dirty")).toHaveCount(0);
      // Only Vietnamese is written, and that is enough (DECISIONS #39): what is missing is a section, the cover, a file.
      await expect(visible(page, "admin-product-title")).toHaveText("Bộ thử E2E");
      await expect(check("content")).toHaveAttribute("data-state", "ok");
      await expect(missing()).toHaveCount(3);

      // Add a section from the tile → its page; its summary in Vietnamese only.
      await visible(page, "pack-tab-sections").click();
      await visible(page, "add-section").click();
      await page.getByTestId("add-section-menu").getByRole("menuitem").first().click();
      await expect(page).toHaveURL(/\/sections\/[a-z0-9]+$/);
      await expect(toast(page, vi.adminProducts.flash.sectionAdded)).toBeVisible();
      const section = visible(page, "section-form");
      await section.getByLabel(vi.adminProducts.assetCount).fill("24");
      // Formats and size are picked from ready-made chips (2026-11-21), not typed.
      await visible(page, "spec-formats-toggle").click();
      const formats = section.getByTestId("spec-formats");
      await formats.getByText("PNG", { exact: true }).click();
      await formats.getByText("GIF", { exact: true }).click();
      await expect(formats.getByRole("checkbox", { name: "PNG", exact: true })).toBeChecked();
      await visible(page, "spec-resolution-toggle").click();
      await section.getByTestId("spec-resolution").getByText("32×32 px", { exact: true }).click();
      // Tabs on the section page (2026-11-21): Info · Content · Pictures; Save sits beside the title.
      await visible(page, "section-tab-content").click();
      await visible(page, "section-content").getByRole("tabpanel").filter({ visible: true }).getByLabel(vi.adminProducts.summary).fill("Tóm tắt phần");
      await visible(page, "section-save").click();
      await expect(toast(page, vi.adminProducts.saved)).toBeVisible();

      // Back on the pack: totals from the section; only the cover and the file are missing now.
      await visible(page, "admin-section-back").click();
      await visible(page, "pack-tab-sections").click();
      await expect(visible(page, "admin-pack-totals")).toContainText("24 asset");
      await expect(visible(page, "admin-pack-totals")).toContainText("PNG, GIF");
      await expect(missing()).toHaveCount(2);
      await expect(check("cover")).toHaveAttribute("data-state", "miss");
      await expect(check("file")).toHaveAttribute("data-state", "miss");
      await expect(visible(page, "status-publish")).toBeDisabled();

      // Not in the store while a draft.
      const store = await page.request.get(`/vi/product/${slug}`);
      expect(await store.text()).not.toContain("Bộ thử E2E");

      // The checklist line opens its tab. The picker never offers SVG; a renamed file is refused after upload.
      await check("cover").click();
      const gallery = visible(page, "pack-media");
      const mediaInput = gallery.getByTestId("pack-media-upload-input");
      await expect(mediaInput).toHaveAttribute("accept", /\.png/);
      await expect(mediaInput).not.toHaveAttribute("accept", /svg/);
      await mediaInput.setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<!doctype html><script>alert(1)</script>") });
      await expect(gallery.getByTestId("upload-error")).toHaveText(vi.adminMedia.errors.badContent);

      // The cover: a real PNG → first picture, marked as cover; that line turns done.
      await mediaInput.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG(64, 48) });
      await expect(gallery.getByTestId("media-item")).toHaveCount(1);
      await expect(gallery.getByTestId("media-item").first()).toHaveAttribute("data-kind", "THUMBNAIL");
      await expect(missing()).toHaveCount(1);

      // The sellable file: an archive into the draft version 1.0.0.
      await visible(page, "pack-tab-versions").click();
      const current = visible(page, "version-current");
      await expect(current).toHaveAttribute("data-released", "false");
      await current.getByTestId("file-upload-input").setInputFiles({ name: "E2E Pack.zip", mimeType: "application/zip", buffer: ZIP });
      await expect(current.getByTestId("version-file")).toHaveCount(1);
      await expect(current.getByTestId("version-file")).toContainText("E2E Pack.zip");
      await expect(missing()).toHaveCount(0);

      // Publish → version 1.0.0 is released (files locked) and the pack is in the store with its cover.
      await visible(page, "status-publish").click();
      await expect(visible(page, "status-panel")).toHaveAttribute("data-status", "PUBLISHED");
      await expect(current).toHaveAttribute("data-released", "true");
      await expect(current.getByTestId("file-delete")).toHaveCount(0);
      const html = await (await page.request.get(`/vi/product/${slug}`)).text();
      expect(html).toContain("Bộ thử E2E");
      // `/media/packs/…` with the local driver, `<R2_PUBLIC_BASE_URL>/packs/…` with R2.
      expect(html).toMatch(/(\/media|https:\/\/[a-z0-9.-]+)\/packs\/[a-z0-9]+\/media\/[0-9a-f]{24}\.png/);
      expect(html).not.toContain("E2E Pack.zip"); // the sellable file is never named or linked in the page

      // Six pictures in one section (several files at once) → the pack page shows 4 tiles, the last one "+3",
      // and the viewer holds all six.
      const editUrl = page.url().split("?")[0];
      await visible(page, "pack-tab-sections").click();
      await visible(page, "admin-section-row").first().click();
      await visible(page, "section-tab-media").click();
      const sectionMedia = visible(page, "section-media");
      await sectionMedia.getByTestId("section-media-upload-input").setInputFiles(
        [1, 2, 3, 4, 5, 6].map((n) => ({ name: `s${n}.png`, mimeType: "image/png", buffer: PNG(16 + n, 12) })),
      );
      await expect(sectionMedia.getByTestId("media-item")).toHaveCount(6, { timeout: 30_000 });
      const tiles = page.getByTestId("section-media-grid").first().getByTestId("section-media-tile");
      // The storefront cache can briefly lag: while the uploads were being saved, another test may have been
      // reading the catalog, and that read can still be stored after updateTag("catalog") (cacheLife "minutes":
      // refreshed in the background after about a minute). Reload until all six are there.
      await expect(async () => {
        await page.goto(`/vi/product/${slug}`);
        await expect(tiles).toHaveCount(4, { timeout: 2_000 });
        await expect(page.getByTestId("section-media-more")).toHaveText("+3", { timeout: 2_000 });
      }).toPass({ timeout: 120_000, intervals: [2_000, 5_000, 10_000] });
      await tiles.nth(3).click();
      await expect(page.getByTestId("media-lightbox-counter")).toHaveText("4 / 6");
      await page.keyboard.press("Escape");

      // Written in Vietnamese only: in English the pack is hidden (not in the shop, its page is the 404).
      await page.goto(`/en/shop?q=${slug}`);
      await expect(page.getByText(en.shop.emptyTitle).filter({ visible: true })).toBeVisible(); // a hidden earlier page may hold a copy
      await page.goto(`/en/product/${slug}`);
      await expect(page.getByRole("heading", { name: en.notFound.title })).toBeVisible();

      // English added later → the pack shows up in English (its section has no English summary yet).
      await page.goto(editUrl);
      await visible(page, "pack-tab-content").click();
      const edit = visible(page, "product-form");
      await edit.getByTestId("locale-tab-en").click();
      const enPanel = edit.getByRole("tabpanel").filter({ visible: true });
      await enPanel.getByLabel(vi.adminProducts.title).fill("E2E test pack");
      await enPanel.getByLabel(vi.adminProducts.shortDescription).fill("Short");
      await enPanel.getByLabel(vi.adminProducts.description).fill("A pack made by the E2E test.");
      await visible(page, "product-save").click();
      await expect(toast(page, vi.adminProducts.saved)).toBeVisible();
      await page.goto(`/en/product/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E test pack");
      await expect(page.locator("main")).not.toContainText("Tóm tắt phần"); // never Vietnamese mixed into English
      await page.goto(`/en/shop?q=${slug}`);
      await expect(page.locator("main article")).toHaveCount(1);
      await page.goto(`${editUrl}?tab=versions`); // a link can open a tab

      // A new version 1.1.0: number rules → draft → its own file → Release.
      await visible(page, "version-new").locator("summary").click();
      const create = visible(page, "version-create-form");
      await expect(create.getByLabel(vi.adminMedia.versionLabel)).toHaveValue("1.1.0");
      await create.getByLabel(vi.adminMedia.versionLabel).fill("1.0.0");
      await visible(page, "version-create").click();
      await expect(create.getByText(vi.adminMedia.errors.versionNotNewer)).toBeVisible();
      await create.getByLabel(vi.adminMedia.versionLabel).fill("1.1.0");
      // "What's new" in Vietnamese only is enough (2026-11-21).
      await create.getByRole("tabpanel").filter({ visible: true }).getByLabel(vi.adminMedia.changelog).fill("Thêm 1 file");
      await visible(page, "version-create").click();
      const draft = visible(page, "version-draft");
      await expect(draft).toBeVisible();
      await expect(visible(page, "version-release")).toBeDisabled();
      await draft.getByTestId("file-upload-input").setInputFiles({ name: "E2E Pack 1.1.zip", mimeType: "application/zip", buffer: ZIP });
      await expect(draft.getByTestId("version-file")).toHaveCount(1);
      await visible(page, "version-release").click();
      await page.getByTestId("version-release-confirm").click();
      await expect(visible(page, "version-current")).toContainText("1.1.0");
      await expect(visible(page, "version-draft")).toHaveCount(0);
      await expect(visible(page, "version-history")).toContainText("1.0.0");

      // Listed as on sale.
      await page.goto(`/vi/admin/products?q=${slug}`);
      const row = visible(page, "admin-product-row");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(vi.adminProducts.status.PUBLISHED);
      await expect(row).toContainText(vi.adminProducts.hiddenIn.replace("{locales}", "ZH")); // Chinese still to write

      // Delete it (nobody bought it): its rows and stored objects go.
      await row.click();
      await visible(page, "product-delete").click();
      await page.getByTestId("product-delete-confirm").click();
      await expect(page).toHaveURL(/\/vi\/admin\/products$/);
      await expect(toast(page, vi.adminProducts.flash.deleted)).toBeVisible();
      await page.goto(`/vi/admin/products?q=${slug}`);
      await expect(visible(page, "admin-product-row")).toHaveCount(0);
    } finally {
      adminCommand("revoke", email);
      // A failure above may leave the pack PUBLISHED, which would change the shop counts of later runs.
      execSync(`npx tsx backend/scripts/e2e-remove-pack.ts ${slug}`, { stdio: "pipe" });
    }
  });

  test("a published seeded pack has its link and type locked", async ({ page }) => {
    test.setTimeout(90_000);
    const email = await registerAdmin(page);
    try {
      await page.goto("/vi/admin/products?q=tien-hiep-dao-mon");
      await visible(page, "admin-product-row").first().click();
      const form = visible(page, "product-form");
      await expect(form.getByLabel(vi.adminProducts.slug)).toHaveAttribute("readonly", "");
      await expect(form.getByText(vi.adminProducts.lockedHint)).toBeVisible();
      await expect(visible(page, "status-panel")).toHaveAttribute("data-status", "PUBLISHED");
      await expect(form.getByTestId("type-PREMIUM")).toBeDisabled();
      // Its gallery (demo pictures) and its released version are shown, each in its tab.
      await visible(page, "pack-tab-media").click();
      await expect(visible(page, "pack-media").getByTestId("media-item").first()).toHaveAttribute("data-kind", "THUMBNAIL");
      await visible(page, "pack-tab-versions").click();
      await expect(visible(page, "version-current")).toHaveAttribute("data-released", "true");
    } finally {
      adminCommand("revoke", email);
    }
  });
});
