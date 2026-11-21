import { expect, storageDriver, test, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

/**
 * Shop page. Runs against the seeded demo catalog on the Neon `dev` branch:
 * 10 complete A→Z packs (8 PREMIUM, 2 FREE; 3 of them Wuxia). If the seed changes, update these numbers.
 * The owner may also publish real packs there through Admin (2026-11-21: one FREE Wuxia pack, Vietnamese only),
 * so counts are checked as "at least the demo packs" and against each other, never as exact totals.
 */
const DEMO = { total: 10, free: 2, wuxia: 3 };
const SHOP_PAGE_SIZE = 12;

const count = (page: Page) => page.getByTestId("shop-count");
const cards = (page: Page) => page.locator("main article");

/** The number in the "N packs" line, once it has rendered. */
async function shown(page: Page): Promise<number> {
  await expect(count(page)).toContainText(/\d/);
  return Number((await count(page).textContent())!.replace(/[^\d]/g, ""));
}

/** Price text of every card, as numbers. */
async function prices(page: Page): Promise<number[]> {
  const texts = await page.getByTestId("card-price").allTextContents();
  return texts.map((t) => Number(t.replace(/[^\d]/g, "")));
}

test.describe("Shop", () => {
  test("lists all published packs (12 per page) with a demo notice", async ({ page }) => {
    await page.goto("/vi/shop");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.shop); // page name lives in the top bar
    const total = await shown(page);
    expect(total).toBeGreaterThanOrEqual(DEMO.total);
    await expect(count(page)).toContainText(`${total} bộ asset`);
    const onPage = Math.min(total, SHOP_PAGE_SIZE);
    await expect(cards(page)).toHaveCount(onPage);
    await expect(page.getByText(vi.shop.demoNotice)).toBeVisible();
    await expect(page.getByText(vi.product.demoImage).first()).toBeVisible();
    await expect(cards(page).first()).toContainText(vi.productPage.packBadge);
    await expect(page.getByText(`Hiển thị 1–${onPage} trên ${total}`)).toBeVisible();
    // One page: no controls; more than 12 packs: page controls.
    await expect(page.getByRole("navigation", { name: vi.shop.pagination.label })).toHaveCount(total > SHOP_PAGE_SIZE ? 1 : 0);
  });

  test("toolbar filters are dropdowns: genre / style / type, no category, file-format or bundle", async ({ page }) => {
    await page.goto("/vi/shop");
    const total = await shown(page);
    for (const id of ["filter-type", "filter-genre", "filter-style", "price-filter-trigger", "shop-sort"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Định dạng file" })).toHaveCount(0);

    await page.getByTestId("filter-type").click();
    const typeMenu = page.getByRole("menu");
    await expect(typeMenu.getByRole("menuitem")).toHaveText([vi.shop.all, vi.shop.types.free, vi.shop.types.premium]);
    await page.keyboard.press("Escape");

    await page.getByTestId("filter-genre").click();
    const genreMenu = page.getByRole("menu");
    await expect(genreMenu.getByRole("menuitem", { name: /Nhân vật/ })).toHaveCount(0);
    await genreMenu.getByRole("menuitem", { name: /Kiếm hiệp/ }).click();
    await expect(page).toHaveURL(/\/vi\/shop\?genre=wuxia$/);
    await expect(count(page)).not.toContainText(`${total} bộ asset`); // the filter narrowed the list
    const wuxia = await shown(page);
    expect(wuxia).toBeGreaterThanOrEqual(DEMO.wuxia);
    expect(wuxia).toBeLessThan(total);
    await expect(cards(page)).toHaveCount(Math.min(wuxia, SHOP_PAGE_SIZE));
    await expect(page.getByTestId("filter-genre")).toContainText("Kiếm hiệp");
  });

  test("filters by type and shows a removable filter chip", async ({ page }) => {
    await page.goto("/en/shop?type=free");
    const free = await shown(page);
    expect(free).toBeGreaterThanOrEqual(DEMO.free);
    await expect(count(page)).toContainText(`${free} packs`);
    // A free pack's price reads "FREE", never "0 ₫" (user request 2026-11-20).
    await expect(cards(page)).toHaveCount(Math.min(free, SHOP_PAGE_SIZE));
    const freePrices = await page.getByTestId("card-price").allTextContents();
    expect(freePrices).toEqual(freePrices.map(() => en.common.freePrice));

    await page.getByRole("link", { name: `Remove filter: ${en.shop.types.free}` }).click();
    await expect(page).toHaveURL(/\/en\/shop$/);
    await expect(count(page)).not.toContainText(`${free} packs`);
    expect(await shown(page)).toBeGreaterThanOrEqual(Math.max(DEMO.total, free + 1));
  });

  test("sale packs show the discount and the struck-through original price", async ({ page }) => {
    await page.goto("/vi/shop?q=dao+mon");
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().getByText(/Giảm \d+%/)).toBeVisible();
    await expect(cards(page).first().locator(".line-through")).toBeVisible();
  });

  test("price range picker in the toolbar filters, shows a chip and can be cleared", async ({ page }) => {
    await page.goto("/vi/shop?genre=xianxia");
    await page.getByTestId("price-filter-trigger").click();
    const panel = page.getByTestId("price-filter");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: vi.shop.priceFilter.apply })).toBeDisabled();
    await expect(panel.getByRole("slider")).toHaveCount(2);

    // Typed amounts apply when leaving the box / pressing Enter (range-slider.md).
    await panel.getByRole("textbox", { name: vi.shop.priceFilter.min }).fill("1000000");
    await panel.getByRole("textbox", { name: vi.shop.priceFilter.min }).press("Enter");
    await panel.getByRole("textbox", { name: vi.shop.priceFilter.max }).fill("1.500.000");
    await panel.getByRole("textbox", { name: vi.shop.priceFilter.max }).press("Enter");
    await panel.getByRole("button", { name: vi.shop.priceFilter.apply }).click();
    await expect(page).toHaveURL(/genre=xianxia&min=1000000&max=1500000/);
    await expect(panel).toBeHidden();
    for (const p of await prices(page)) {
      expect(p).toBeGreaterThanOrEqual(1_000_000);
      expect(p).toBeLessThanOrEqual(1_500_000);
    }
    await expect(page.getByTestId("price-filter-trigger")).toContainText("1.000.000 ₫ – 1.500.000 ₫");

    // Keyboard on the max thumb: End = no upper bound.
    await page.getByTestId("price-filter-trigger").click();
    await panel.getByRole("slider", { name: vi.shop.priceFilter.max }).press("End");
    await panel.getByRole("button", { name: vi.shop.priceFilter.apply }).click();
    await expect(page).toHaveURL(/genre=xianxia&min=1000000$/);

    await page.getByRole("link", { name: /Bỏ lọc: Từ 1\.000\.000/ }).click();
    await expect(page).toHaveURL(/\/vi\/shop\?genre=xianxia$/);
  });

  test("sorting by price works in both directions and keeps filters", async ({ page }) => {
    await page.goto("/vi/shop?type=premium");
    await page.getByTestId("shop-sort").click();
    await page.getByRole("menuitem", { name: vi.shop.sort.priceAsc }).click();
    await expect(page).toHaveURL(/type=premium&sort=price-asc/);
    const asc = await prices(page);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));

    await page.getByTestId("shop-sort").click();
    await page.getByRole("menuitem", { name: vi.shop.sort.priceDesc }).click();
    await expect(page).toHaveURL(/sort=price-desc/);
    const desc = await prices(page);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(desc[0]).toBeGreaterThanOrEqual(asc[asc.length - 1]);
  });

  test("search ignores Vietnamese diacritics and keeps other filters", async ({ page }) => {
    await page.goto("/vi/shop?type=premium");
    const box = page.getByRole("searchbox", { name: vi.shop.searchLabel });
    await box.fill("tien hiep");
    await box.press("Enter");
    await expect(page).toHaveURL(/type=premium/);
    await expect(page).toHaveURL(/q=tien\+hiep/);
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText("Tiên Hiệp Đạo Môn");
  });

  test("an impossible combination shows the empty state", async ({ page }) => {
    await page.goto("/vi/shop?type=free&min=1000000");
    await expect(page.getByText(vi.shop.emptyTitle)).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });

  test("malformed parameters are ignored instead of crashing", async ({ page }) => {
    await page.goto("/vi/shop");
    const total = await shown(page);
    const res = await page.goto("/vi/shop?page=-5&sort=hack&type=bundle&category=..%2F..");
    expect(res?.status()).toBe(200);
    await expect(count(page)).toContainText(`${total} bộ asset`); // same list as with no parameters
  });

  test("Chinese shop is fully translated", async ({ page }) => {
    await page.goto("/zh/shop");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(zh.nav.shop);
    const total = await shown(page);
    expect(total).toBeGreaterThanOrEqual(DEMO.total);
    await expect(count(page)).toContainText(`共 ${total} 个素材包`);
    await expect(cards(page).first()).toContainText(/[一-鿿]/);
  });

  test("a card opens the product page", async ({ page }) => {
    await page.goto("/vi/shop?q=dao+mon");
    await cards(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/vi\/product\/tien-hiep-dao-mon$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tiên Hiệp Đạo Môn");
  });

  test("'back to the shop' on a pack returns to the same list (search, filters, sort kept)", async ({ page }) => {
    await page.goto("/vi/shop?type=premium&sort=price-asc");
    await cards(page).first().getByRole("link").click();
    await expect(page).toHaveURL(/\/vi\/product\//);
    const back = page.getByTestId("back-to-shop").filter({ visible: true });
    await expect(back).toHaveText(vi.productPage.backToShop);
    await back.click();
    await expect(page).toHaveURL((u) => u.pathname === "/vi/shop" && u.searchParams.get("type") === "premium" && u.searchParams.get("sort") === "price-asc");

    // Opened directly (no shop visited in this tab): it simply opens the shop.
    const fresh = await page.context().newPage();
    await fresh.goto("/vi/product/tien-hiep-dao-mon");
    await fresh.getByTestId("back-to-shop").filter({ visible: true }).click();
    await expect(fresh).toHaveURL(/\/vi\/shop$/);
    await fresh.close();
  });

  test("mobile: filter buttons sit in one scrolling row and apply a filter", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/vi/shop");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0); // the row scrolls inside itself, the page never scrolls sideways
    await page.getByTestId("filter-type").click();
    await page.getByRole("menuitem", { name: vi.shop.types.free, exact: true }).click();
    await expect(page).toHaveURL(/type=free/);
    const free = await shown(page);
    expect(free).toBeGreaterThanOrEqual(DEMO.free);
    await expect(cards(page)).toHaveCount(Math.min(free, SHOP_PAGE_SIZE));
    const freePrices = await page.getByTestId("card-price").allTextContents();
    expect(freePrices).toEqual(freePrices.map(() => vi.common.freePrice));
  });
});

test.describe("Media route", () => {
  test("serves public previews safely and never exposes private files", async ({ request }) => {
    test.skip(storageDriver() !== "local", "the /media route serves the local driver only (R2: npm run storage:check)");
    const ok = await request.get("/media/products/tien-hiep-dao-mon/0.svg");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/svg+xml");
    expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
    expect(ok.headers()["content-security-policy"]).toContain("sandbox");
    expect((await request.get("/media/products/tien-hiep-dao-mon/characters/0.svg")).status()).toBe(200);

    // The sellable demo file exists in the PRIVATE bucket but must not be reachable here.
    const priv = await request.get("/media/products/tien-hiep-dao-mon/1.3.0/tien-hiep-dao-mon-demo-readme.txt");
    expect(priv.status()).toBe(404);
    expect((await request.get("/media/products/../../.env.local")).status()).toBe(404);
  });
});
