import { expect, test } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };

/**
 * Info pages (user choice 2026-11-22): About + FAQ in the menu's Support group, Terms · Privacy · Refund above the
 * copyright line (moved there 2026-11-26; not a menu group, DECISIONS #20), sample texts with a notice, all three languages.
 */
const PAGES = ["about", "faq", "terms", "privacy", "refund"] as const;
const all = { vi, en, zh };

test.describe("Info pages", () => {
  for (const [locale, m] of Object.entries(all)) {
    test(`${locale}: the five pages have their name as <h1>, the sample notice and no raw keys`, async ({ page }) => {
      for (const p of PAGES) {
        const res = await page.goto(`/${locale}/${p}`);
        expect(res?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: m.nav[p] })).toBeVisible();
        await expect(page.getByTestId(`info-${p}`)).toBeVisible();
        await expect(page.getByTestId("info-draft-notice")).toHaveText(m.info.draftNotice);
        await expect(page.getByTestId(`info-${p}`)).not.toContainText(`info.${p}`);
        await expect(page).toHaveTitle(new RegExp(m.nav[p]));
      }
    });
  }

  test("FAQ: a question opens its answer", async ({ page }) => {
    await page.goto("/vi/faq");
    const q = vi.info.faq.groups.free.items.count;
    const answer = page.getByText(q.a);
    await expect(answer).toBeHidden();
    await page.getByText(q.q).click();
    await expect(answer).toBeVisible();
  });

  test("desktop: Terms · Privacy · Refund above the copyright line, not in the menu", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar");
    await page.goto("/vi/shop");
    const sidebar = page.getByTestId("app-sidebar");
    const legal = sidebar.getByRole("navigation", { name: vi.nav.legalLabel });
    for (const p of ["terms", "privacy", "refund"] as const) await expect(legal.getByRole("link", { name: vi.nav[p] })).toBeVisible();
    // The copyright line is the last line of the sidebar, right under the legal links.
    expect(await legal.evaluate((el) => el.nextElementSibling?.textContent ?? "")).toContain("©");
    await expect(sidebar.getByRole("navigation", { name: vi.nav.mainLabel }).getByRole("link", { name: vi.nav.terms })).toHaveCount(0);
    await legal.getByRole("link", { name: vi.nav.refund }).click();
    await expect(page).toHaveURL(/\/vi\/refund$/);
    await sidebar.getByRole("link", { name: vi.nav.about }).click();
    await expect(page).toHaveURL(/\/vi\/about$/);
    await expect(sidebar.getByRole("link", { name: vi.nav.about })).toHaveAttribute("aria-current", "page");
  });

  test("mobile: the More sheet has the legal links and closes on navigation", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/vi/shop");
    await page.getByTestId("tabbar-more").click();
    const sheet = page.getByRole("dialog", { name: vi.nav.more });
    const legal = sheet.getByRole("navigation", { name: vi.nav.legalLabel });
    expect(await legal.evaluate((el) => el.nextElementSibling?.textContent ?? "")).toContain("©");
    await legal.getByRole("link", { name: vi.nav.privacy }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/vi\/privacy$/);
    await expect(page.getByTestId("tabbar-more")).toHaveClass(/text-gold-300/); // "More" is the active tab
  });

  test("sign-up links to the terms and the privacy policy", async ({ page }) => {
    await page.goto("/en/register");
    const agree = page.getByTestId("register-agree");
    await expect(agree.getByRole("link", { name: en.nav.terms })).toHaveAttribute("href", "/en/terms");
    await expect(agree.getByRole("link", { name: en.nav.privacy })).toHaveAttribute("href", "/en/privacy");
  });

  test("sitemap lists the five pages in every language", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const l of ["vi", "en", "zh"]) for (const p of PAGES) expect(xml).toMatch(new RegExp(`<loc>https?://[^<]+/${l}/${p}</loc>`));
  });
});
