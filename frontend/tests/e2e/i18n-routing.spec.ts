import { expect, test } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };
import { flattenMessages } from "../../scripts/i18n-check";

// Matches Vietnamese-specific letters (with diacritics). Used to prove EN/ZH modes have no Vietnamese UI text,
// excluding the language switcher, whose labels are language autonyms ("Tiếng Việt").
const VIETNAMESE_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

test.describe("Locale routing (CLAUDE.md §8)", () => {
  test("first visit to / goes to the Vietnamese store even when the browser prefers English", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/vi\/shop$/); // no home page: the store is the start page
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.shop);
    await context.close();
  });

  test("/en renders English with no Vietnamese UI text", async ({ page }) => {
    await page.goto("/en/shop");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.nav.shop);
    // Whole page (sidebar + top bar + main), excluding elements explicitly marked lang="vi" (language autonyms).
    const text = await page.locator("body").evaluate((body) => {
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[lang="vi"], script, style').forEach((n) => n.remove());
      return clone.innerText;
    });
    expect(text).not.toMatch(VIETNAMESE_CHARS);
    // No raw technical keys such as "home.title" leaked into the page.
    for (const key of flattenMessages(en).keys()) expect(text).not.toContain(key);
  });

  test("/zh renders Simplified Chinese with no Vietnamese text or raw keys", async ({ page }) => {
    await page.goto("/zh/shop");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(zh.nav.shop);
    const text = await page.locator("body").evaluate((body) => {
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[lang="vi"], script, style').forEach((n) => n.remove());
      return clone.innerText;
    });
    expect(text).not.toMatch(VIETNAMESE_CHARS);
    expect(text).toMatch(/[一-鿿]/); // contains Chinese characters
    for (const key of flattenMessages(zh).keys()) expect(text).not.toContain(key);
  });

  test("switching to 中文 keeps the page and query", async ({ page }) => {
    await page.goto("/en/shop?genre=wuxia");
    await page.getByTestId("locale-switcher").click();
    await expect(page.getByTestId("locale-zh")).toHaveText(zh.localeSwitcher.zh);
    await page.getByTestId("locale-zh").click();
    await expect(page).toHaveURL(/\/zh\/shop\?genre=wuxia$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(zh.nav.shop);
  });

  test("switching language keeps the page and query, and the choice is remembered", async ({ page }) => {
    await page.goto("/vi/shop?genre=wuxia");
    await page.getByTestId("locale-switcher").click();
    await page.getByTestId("locale-en").click();
    await expect(page).toHaveURL(/\/en\/shop\?genre=wuxia$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.nav.shop);

    // Reload keeps English; visiting / again goes to the remembered locale.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/shop$/);
  });

  test("unknown pages show a localized 404", async ({ page }) => {
    const resVi = await page.goto("/vi/khong-ton-tai");
    expect(resVi?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.notFound.title);

    const resEn = await page.goto("/en/does-not-exist");
    expect(resEn?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.notFound.title);

    const resZh = await page.goto("/zh/bu-cun-zai");
    expect(resZh?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(zh.notFound.title);
  });

  test("unprefixed paths are redirected under /vi", async ({ page }) => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/vi\/shop$/);
  });
});
