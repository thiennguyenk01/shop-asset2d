import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin area (GĐ5.1, decision "Admin (GĐ5)"): a 404 for guests and ordinary users — no menu, nothing that
 * hints at it; an Admin (made with the real `admin:grant` command) gets the "Admin" menu entry and the overview.
 */
const PASSWORD = "matkhau-e2e-123";
const uniqueEmail = () => `e2e-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function register(page: Page, email: string) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Quản Trị Viên");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

/** The same command the shop owner runs (refused on production by its guard). */
const adminCommand = (action: "grant" | "revoke", email: string) =>
  execSync(`npx tsx backend/scripts/admin-grant.ts ${action} ${email}`, { cwd: process.cwd(), stdio: "pipe" }).toString();

async function expectStoreNotFound(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
  await expect(page.getByTestId("admin-shell")).toHaveCount(0);
  await expect(page.getByText(vi.admin.nav.orders)).toHaveCount(0);
}

test.describe("Admin area", () => {
  test("guests get the ordinary 404 — no admin menu", async ({ page }) => {
    const response = await page.goto("/vi/admin");
    expect(response?.status()).toBeLessThan(500);
    await expectStoreNotFound(page);
  });

  test("an ordinary user gets the 404 and no Admin entry in the account menu", async ({ page }) => {
    await register(page, uniqueEmail());
    await visible(page, "account-menu").click();
    await expect(page.getByTestId("admin-link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/vi/admin");
    await expectStoreNotFound(page);
  });

  test("an Admin sees the menu entry and the overview; revoking takes it away at once", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    await register(page, email);
    expect(adminCommand("grant", email)).toContain(email);
    try {
      await page.reload();
      await visible(page, "account-menu").click();
      await page.getByTestId("admin-link").click();
      await expect(page).toHaveURL(/\/vi\/admin$/);

      await expect(page.getByTestId("admin-shell")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: vi.admin.overview.title })).toBeVisible();
      for (const key of ["revenue", "orders", "packs", "users", "downloads"]) {
        await expect(page.getByTestId(`admin-tile-${key}`)).toBeVisible();
      }
      // "Needs attention" is a bell in the top bar (user request 2026-11-19), not a card on the page.
      const bell = visible(page, "admin-attention-button");
      await expect(bell).toHaveAttribute("aria-label", new RegExp(`^${vi.admin.attention.open}`));
      await bell.click();
      const panel = page.getByTestId("admin-attention-panel");
      await expect(panel.getByRole("heading", { name: vi.admin.attention.title })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      // Recent orders, best sellers and free downloads side by side.
      const lists = visible(page, "admin-lists");
      for (const id of ["admin-recent-orders", "stats-top-sellers", "stats-top-free"])
        await expect(lists.getByTestId(id)).toBeVisible();
      await expect(lists.getByTestId("admin-recent-all")).toHaveAttribute("href", "/vi/admin/orders");
      // Built steps are links (orders: 5.4, users: 5.5, coupons + settings: 5.6).
      await expect(visible(page, "admin-nav-orders")).toHaveAttribute("href", "/vi/admin/orders");
      await expect(visible(page, "admin-nav-users")).toHaveAttribute("href", "/vi/admin/users");
      await expect(visible(page, "admin-nav-coupons")).toHaveAttribute("href", "/vi/admin/coupons");
      await expect(visible(page, "admin-nav-settings")).toHaveAttribute("href", "/vi/admin/settings");
      await expect(visible(page, "admin-nav-overview")).toHaveAttribute("aria-current", "page");

      // Translated like the rest of the site.
      await page.goto("/en/admin");
      await expect(page.getByRole("heading", { level: 1, name: en.admin.overview.title })).toBeVisible();

      // Back to the store.
      await visible(page, "admin-back-to-store").click();
      await expect(page).toHaveURL(/\/en\/shop$/);
    } finally {
      adminCommand("revoke", email);
    }
    // Revoking signs every session of that account out; the area is a 404 again.
    await page.goto("/vi/admin");
    await expectStoreNotFound(page);
  });
});
