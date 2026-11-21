import { expect, test } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/** Dashboard shell (CLAUDE.md §13): sidebar + top bar on desktop, bottom tab bar on mobile. No home page. */
test.describe("Dashboard layout", () => {
  test("desktop: sidebar with active item, support/legal links and copyright; top bar search", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar");
    await page.goto("/vi/shop");
    const sidebar = page.getByTestId("app-sidebar");
    await expect(sidebar.getByRole("link", { name: vi.brand.homeLink })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: vi.nav.shop })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: vi.nav.faq })).toBeVisible();
    await expect(sidebar).not.toContainText("Pháp lý"); // legal group removed (user request)
    await expect(sidebar).toContainText(String(new Date().getFullYear()));
    await expect(page.getByTestId("mobile-tabbar")).toBeHidden();
    await expect(page.locator("footer")).toHaveCount(0);

    await sidebar.getByRole("link", { name: vi.nav.free }).click();
    await expect(page).toHaveURL(/\/vi\/shop\?type=free$/);
    await expect(sidebar.getByRole("link", { name: vi.nav.free })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: vi.nav.shop })).not.toHaveAttribute("aria-current", "page");
  });

  test("the sidebar stays in place while the content scrolls", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar");
    await page.goto("/vi/shop");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByTestId("app-sidebar").getByRole("link", { name: vi.nav.shop })).toBeInViewport();
  });

  test("sidebar collapses to an icon rail (logo seal only) and the choice survives a reload", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar");
    await page.goto("/vi/shop");
    const sidebar = page.getByTestId("app-sidebar");
    const toggle = page.getByTestId("sidebar-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(64);
    await expect(sidebar.getByRole("link", { name: vi.nav.shop })).toHaveAttribute("title", vi.nav.shop); // name as tooltip

    await page.reload();
    await expect(page.getByTestId("sidebar-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(64);
    await page.getByTestId("sidebar-toggle").click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(256);
  });

  test("contact is a floating chat button listing the contact channels", async ({ page }) => {
    await page.goto("/vi/shop");
    await page.getByTestId("contact-chat").click();
    const panel = page.getByTestId("contact-chat-panel");
    await expect(panel).toBeVisible();
    for (const c of Object.values(vi.contactChat.channels)) await expect(panel).toContainText(c.name);
    // Channels without a configured link are shown as "coming soon", never with made-up contact details.
    await expect(panel.getByText(vi.contactChat.comingSoon).first()).toBeVisible();
    await expect(panel.getByRole("link", { name: new RegExp(vi.contactChat.channels.support.name) })).toHaveAttribute("href", "/vi/contact");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("mobile: bottom tab bar navigates; More opens a sheet with the other links", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/vi/shop");
    await expect(page.getByTestId("app-sidebar")).toBeHidden();
    const tabbar = page.getByTestId("mobile-tabbar");
    await expect(tabbar).toBeVisible();
    await expect(tabbar.getByRole("link", { name: vi.nav.shop })).toHaveAttribute("aria-current", "page");

    await tabbar.getByRole("link", { name: vi.nav.free }).click();
    await expect(page).toHaveURL(/\/vi\/shop\?type=free$/);
    await expect(tabbar.getByRole("link", { name: vi.nav.free })).toHaveAttribute("aria-current", "page");

    // Premium sits next to Free in the tab bar (user request 2026-11-20), in the sidebar's order.
    const tabNames = await tabbar.getByRole("link").allInnerTexts();
    expect(tabNames.map((s) => s.trim()).slice(0, 3)).toEqual([vi.nav.shop, vi.nav.premium, vi.nav.free]);
    await tabbar.getByRole("link", { name: vi.nav.premium }).click();
    await expect(page).toHaveURL(/\/vi\/shop\?type=premium$/);
    await expect(tabbar.getByRole("link", { name: vi.nav.premium })).toHaveAttribute("aria-current", "page");
    await expect(tabbar.getByRole("link", { name: vi.nav.free })).not.toHaveAttribute("aria-current", "page");

    await page.getByTestId("tabbar-more").click();
    const sheet = page.getByRole("dialog", { name: vi.nav.more });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: vi.nav.faq })).toBeVisible();
    await expect(sheet.getByRole("link", { name: vi.nav.premium })).toHaveCount(0);
    await sheet.getByRole("link", { name: vi.nav.orders }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/vi\/(orders|login)/); // signed out → sign-in first
  });

  test("mobile: all six tab labels fit on a narrow phone in every language", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.setViewportSize({ width: 320, height: 640 });
    for (const locale of ["vi", "en", "zh"]) {
      await page.goto(`/${locale}/shop`);
      const cells = page.getByTestId("mobile-tabbar").locator("li");
      await expect(cells).toHaveCount(6);
      // Each label is one line that fits inside its cell (no wrap, no overflow).
      const bad = await cells.evaluateAll((lis) =>
        lis.flatMap((li) => {
          const cell = li.getBoundingClientRect();
          const text = [...li.querySelector("a, button")!.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
          if (!text) return ["(no label)"];
          const range = document.createRange();
          range.selectNodeContents(text);
          const lines = range.getClientRects();
          const box = range.getBoundingClientRect();
          return lines.length === 1 && box.left >= cell.left && box.right <= cell.right ? [] : [text.textContent!];
        }),
      );
      expect(bad, locale).toEqual([]);
    }
  });

  test("mobile: the last products are not hidden behind the tab bar", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/vi/shop");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // Last row of the list = the pagination summary line ("Hiển thị 1–10 trên 10"; the dev database may hold more
    // than the 10 demo packs, see shop.spec.ts).
    const pager = page.getByText(/^Hiển thị 1–\d+ trên \d+$/);
    const pagerBox = (await pager.boundingBox())!;
    const barBox = (await page.getByTestId("mobile-tabbar").boundingBox())!;
    expect(pagerBox.y + pagerBox.height).toBeLessThanOrEqual(barBox.y);
  });

  test("no horizontal scrolling", async ({ page }) => {
    await page.goto("/vi/shop");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Design system feedback components", () => {
  test("modal opens and closes with Escape; toasts appear", async ({ page }) => {
    await page.goto("/vi/design-system");
    await page.getByRole("button", { name: vi.designSystem.openModal }).click();
    const modal = page.getByRole("dialog", { name: vi.designSystem.modalTitle });
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();

    await page.getByRole("button", { name: vi.designSystem.showToastSuccess }).click();
    await expect(page.getByTestId("toast").filter({ hasText: vi.designSystem.toastSuccess })).toBeVisible();
  });
  test("notification bell sits left of the account button and opens an honest empty panel", async ({ page }) => {
    await page.goto("/vi/shop");
    const bell = page.getByTestId("notifications-button");
    const account = page.getByTestId("sign-in-link");
    await expect(bell).toBeVisible();
    const [b, a] = [(await bell.boundingBox())!, (await account.boundingBox())!];
    expect(b.x + b.width).toBeLessThanOrEqual(a.x);
    await bell.click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel.getByRole("heading", { name: vi.notifications.title })).toBeVisible();
    await expect(panel).toContainText(vi.notifications.emptyTitle);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });
  test("theme button sits left of the language button, switches to light and is remembered", async ({ page }) => {
    await page.goto("/vi/shop");
    const toggle = page.getByTestId("theme-toggle");
    const lang = page.getByTestId("locale-switcher");
    const [t, l] = [(await toggle.boundingBox())!, (await lang.boundingBox())!];
    expect(t.x + t.width).toBeLessThanOrEqual(l.x);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg()).toBe("rgb(11, 9, 8)"); // dark by default
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bg()).toBe("rgb(245, 240, 229)"); // #F5F0E5
    await expect(toggle).toHaveAttribute("aria-label", vi.header.themeDark);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  });

  test("light theme and the collapsed sidebar survive a language switch, with no script warning", async ({ page, isMobile }) => {
    // Switching language builds a new root layout in the browser: React clears <html> attributes and the inline
    // script does not run there (components/layout/remembered-ui-state.tsx re-applies them before paint).
    // React prints the script warning only in development builds; the E2E build checks the attributes.
    const scriptWarnings: string[] = [];
    page.on("console", (m) => {
      if (m.text().includes("Encountered a script tag")) scriptWarnings.push(m.text());
    });
    await page.goto("/vi/shop");
    await page.getByTestId("theme-toggle").click();
    if (!isMobile) await page.getByTestId("sidebar-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("locale-switcher").click();
    await page.getByTestId("locale-en").click();
    await expect(page).toHaveURL(/\/en\/shop$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    if (!isMobile) await expect(page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
    await expect(page.getByTestId("theme-toggle").filter({ visible: true })).toHaveAttribute("aria-label", en.header.themeDark);
    expect(scriptWarnings).toEqual([]);
  });
});

test.describe("Back to top", () => {
  test("appears after scrolling down, glides back to the top, then hides again", async ({ page }) => {
    await page.goto("/vi/product/tien-hiep-dao-mon"); // a long page
    const button = page.getByTestId("back-to-top");
    await expect(button).toHaveAttribute("data-visible", "false");
    await expect(button).toHaveAttribute("aria-hidden", "true"); // + inert: not focusable while not needed

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(button).toHaveAttribute("data-visible", "true");
    await expect(button).toHaveAccessibleName(vi.common.backToTop);
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 }).toBe(0);
    await expect(button).toHaveAttribute("data-visible", "false");
  });
});
