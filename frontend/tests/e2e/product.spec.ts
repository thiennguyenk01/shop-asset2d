import { expect, test } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

/**
 * Product detail page: one complete A→Z pack whose categories are sections, navigated by a
 * bottom bar that stays fixed while scrolling. Seed: "tien-hiep-dao-mon" contains all 21 sections.
 */
const SLUG = "tien-hiep-dao-mon";

test.describe("Product page", () => {
  test("shows the pack, its 21 sections, its benefits and an honest empty review state", async ({ page }) => {
    await page.goto(`/vi/product/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tiên Hiệp Đạo Môn");
    await expect(page.getByTestId("product-price")).toHaveText(/1\.490\.000/);
    await expect(page.getByText(vi.productPage.demoNotice)).toBeVisible();
    await expect(page.locator("article[id^='sec-']")).toHaveCount(21);
    await expect(page.getByRole("heading", { level: 3, name: "Quái vật & Boss" })).toBeVisible();
    // Premium benefits: every row included. No license tier names anywhere.
    const benefits = page.getByTestId("pack-benefits");
    await expect(page.getByRole("heading", { name: vi.productPage.benefitsPremium })).toBeVisible();
    for (const label of Object.values(vi.productPage.benefits)) {
      await expect(benefits).toContainText(`${label}: ${vi.productPage.included}`);
    }
    await expect(page.locator("main")).not.toContainText(/Giấy phép|Điều khoản/);
    await expect(page.getByText(vi.productPage.reviewsEmptyTitle)).toBeVisible();
  });

  test("a free pack shows the free benefits: no customisation, no commercial games, one project", async ({ page }) => {
    await page.goto("/vi/product/khoi-dau-tien-hiep");
    await expect(page.getByTestId("product-price")).toHaveText(vi.common.freePrice); // "FREE", not "0 ₫" (2026-11-20)
    await expect(page.getByRole("heading", { name: vi.productPage.benefitsFree })).toBeVisible();
    const benefits = page.getByTestId("pack-benefits");
    const b = vi.productPage.benefits;
    for (const label of [b.download, b.personal]) await expect(benefits).toContainText(`${label}: ${vi.productPage.included}`);
    for (const label of [b.customize, b.commercial, b.multiProject]) await expect(benefits).toContainText(`${label}: ${vi.productPage.notIncluded}`);
    await expect(page.getByText(vi.productPage.benefitsUpsell)).toBeVisible();
  });

  test("bottom section nav jumps to a section and stays fixed while scrolling", async ({ page }) => {
    await page.goto(`/vi/product/${SLUG}`);
    const nav = page.getByTestId("section-nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(21 + 4); // overview + sections + what's new + benefits + reviews

    const viewport = page.viewportSize()!;
    // Desktop: flush with the bottom of the viewport. Mobile: sits right on top of the bottom tab bar.
    const tabbar = page.getByTestId("mobile-tabbar");
    const atBottom = async () => {
      const box = (await nav.boundingBox())!;
      const bottom = (await tabbar.isVisible()) ? (await tabbar.boundingBox())!.y : viewport.height;
      expect(Math.abs(box.y + box.height - bottom)).toBeLessThanOrEqual(1);
    };
    await atBottom();

    const item = nav.getByRole("link", { name: "Quái vật & Boss" });
    await item.click();
    await expect(page).toHaveURL(/#sec-monsters-bosses$/);
    await expect(page.getByRole("heading", { level: 3, name: "Quái vật & Boss" })).toBeInViewport();
    await expect(item).toHaveAttribute("aria-current", "location");
    await expect(item).toBeInViewport(); // the bar scrolled horizontally to show it
    await atBottom();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(nav.getByRole("link", { name: vi.productPage.reviewsTitle })).toHaveAttribute("aria-current", "location");
    await atBottom();
  });

  test("add to cart confirms with a toast above the bottom section bar", async ({ page }) => {
    await page.goto(`/vi/product/${SLUG}`);
    await page.getByRole("button", { name: vi.productPage.addToCart }).click();
    const toast = page.getByTestId("toast").first();
    await expect(toast).toContainText(vi.cart.added);
    // The toast sits above the bottom bar, not under it.
    const toastBox = (await toast.boundingBox())!;
    const navBox = (await page.getByTestId("section-nav").boundingBox())!;
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(navBox.y + 1);
  });

  test("free pack offers a free download instead of buying", async ({ page }) => {
    await page.goto("/vi/product/khoi-dau-tien-hiep");
    await expect(page.getByRole("button", { name: vi.productPage.downloadFree })).toBeVisible();
    await expect(page.getByRole("button", { name: vi.productPage.buyNow })).toHaveCount(0);
    await expect(page.getByTestId("section-nav").getByRole("link")).toHaveCount(8 + 4);
  });

  test("what's new: released versions newest first, the current one marked, reached from the buy column (2026-11-26)", async ({ page }) => {
    // Seed: this pack has 1.0.0 then 1.3.0, both released, each with a note in 3 languages.
    await page.goto(`/vi/product/${SLUG}`);
    const changes = page.getByTestId("pack-changes");
    await expect(changes.getByRole("heading", { level: 2 })).toHaveText(vi.productPage.changesTitle);
    const releases = changes.getByTestId("pack-release");
    await expect(releases).toHaveCount(2);
    await expect(releases.nth(0)).toHaveAttribute("data-version", "1.3.0");
    await expect(releases.nth(0)).toContainText(vi.productPage.changesCurrent);
    await expect(releases.nth(0)).toContainText("Thêm hoạt ảnh và sửa lỗi nhỏ (demo).");
    await expect(releases.nth(1)).toHaveAttribute("data-version", "1.0.0");
    await expect(releases.nth(1)).toContainText("Phát hành lần đầu.");
    await expect(releases.nth(1)).not.toContainText(vi.productPage.changesCurrent);

    const link = page.getByTestId("fact-version").getByTestId("changes-link");
    await expect(link).toHaveText(vi.productPage.changesLink);
    await link.click();
    await expect(page).toHaveURL(/#changes$/);
    await expect(changes.getByRole("heading", { level: 2 })).toBeInViewport();

    await page.goto(`/zh/product/${SLUG}`);
    await expect(page.getByTestId("pack-changes").getByTestId("pack-release").nth(1)).toContainText("首次发布。");
  });

  test("Chinese product page is translated", async ({ page }) => {
    await page.goto(`/zh/product/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("仙侠道门");
    await expect(page.getByRole("heading", { name: zh.productPage.sectionsTitle })).toBeVisible();
    await expect(page.getByTestId("section-nav")).toHaveAttribute("aria-label", zh.productPage.sectionNavLabel);
  });

  test("unknown pack shows the localized 404 and is never indexed", async ({ page }) => {
    // With Cache Components an unknown slug is first served from the prerendered shell, so the
    // HTTP status may already be 200 when notFound() runs; Next.js then injects noindex instead.
    const res = await page.goto(`/vi/product/khong-ton-tai-${Date.now()}`);
    expect([200, 404]).toContain(res?.status());
    await expect(page.getByRole("heading", { name: vi.notFound.title })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  });

  test("buy column: key facts sit under the buy button and the whole column stays on screen while scrolling", async ({ page, isMobile }) => {
    test.skip(isMobile, "the column is sticky on wide screens only");
    await page.setViewportSize({ width: 1440, height: 900 }); // wide enough for the two-column layout (70rem box)
    await page.goto(`/vi/product/${SLUG}`);
    const panel = page.getByTestId("buy-panel");
    await expect(panel.getByTestId("fact-total-assets")).toContainText(vi.productPage.totalAssets);
    await expect(panel.getByTestId("fact-sections")).toContainText("21");
    await expect(panel.getByTestId("benefits-summary")).toContainText("Lợi ích gói Premium: gồm 5/5 lợi ích");

    // Deep in the page (section 15 or so), the column is still fully readable.
    await page.mouse.wheel(0, 4000);
    await expect(async () => {
      const box = await panel.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }).toPass();
    await expect(panel.getByTestId("fact-total-assets")).toBeInViewport();
    await expect(panel.getByTestId("benefits-summary")).toBeInViewport();

    // "See details" jumps to the full benefits block.
    await panel.getByTestId("benefits-summary").getByRole("link").click();
    await expect(page.getByTestId("pack-benefits")).toBeInViewport();
  });

  test("pictures stay compact: one row of small previews, at most 4 tiles per section, a full-screen viewer", async ({ page }) => {
    await page.goto(`/vi/product/${SLUG}`);
    // Overview: the small previews are a single row (it scrolls sideways instead of growing taller).
    const strip = page.getByTestId("gallery-strip");
    const thumbs = strip.getByRole("button");
    const count = await thumbs.count();
    expect(count).toBeGreaterThan(1);
    const first = await thumbs.first().boundingBox();
    const last = await thumbs.last().boundingBox();
    expect(Math.abs((last?.y ?? 0) - (first?.y ?? 0))).toBeLessThan(2);

    // The large picture opens the viewer: counter, next / ← key, Esc closes.
    await page.getByTestId("gallery-open").click();
    const viewer = page.getByTestId("media-lightbox");
    await expect(viewer).toBeVisible();
    await expect(page.getByTestId("media-lightbox-counter")).toHaveText(`1 / ${count}`);
    await page.getByTestId("media-lightbox-next").click();
    await expect(page.getByTestId("media-lightbox-counter")).toHaveText(`2 / ${count}`);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("media-lightbox-counter")).toHaveText(`1 / ${count}`);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);

    // A section opens the same viewer on the tile that was clicked.
    const grid = page.getByTestId("section-media-grid").first();
    const tiles = grid.getByTestId("section-media-tile");
    expect(await tiles.count()).toBeLessThanOrEqual(4);
    await tiles.nth(1).click();
    await expect(page.getByTestId("media-lightbox-counter")).toHaveText(/^2 \/ \d+$/);
    await page.getByRole("button", { name: vi.productPage.viewerClose }).click();
    await expect(viewer).toHaveCount(0);
  });

  test("no horizontal page scroll on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto(`/vi/product/${SLUG}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
