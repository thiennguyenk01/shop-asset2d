import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin "Usage" (user choice 2026-11-22): the free allowances this environment uses (database, the two buckets,
 * mails), from the menu, with "Measure now". Ordinary users get the 404. The overview banner only shows from 80 %,
 * which the dev database is far from: its rule is unit-tested (usage.test.ts).
 */
const PASSWORD = "matkhau-e2e-123";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const adminCommand = (action: "grant" | "revoke", email: string) =>
  execSync(`npx tsx backend/scripts/admin-grant.ts ${action} ${email}`, { stdio: "pipe" }).toString();

async function register(page: Page, email: string) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Lâm Phong");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

test.describe("Admin: usage of the free plans", () => {
  test("ordinary users get the 404", async ({ page }) => {
    await register(page, `e2e-adm-use-user-${uid()}@example.test`);
    await page.goto("/vi/admin/usage");
    await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
    await expect(page.getByTestId("admin-shell")).toHaveCount(0);
  });

  test("four allowances with a bar each, largest tables, measure again", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `e2e-adm-use-${uid()}@example.test`;
    await register(page, email);
    adminCommand("grant", email);
    try {
      await page.goto("/vi/admin");
      await page.getByRole("link", { name: vi.admin.nav.usage }).filter({ visible: true }).first().click();
      await expect(page).toHaveURL(/\/vi\/admin\/usage$/);
      await expect(page.getByRole("heading", { level: 1, name: vi.adminUsage.title })).toBeVisible();
      for (const key of ["database", "storage", "emailDay", "emailMonth"]) {
        const card = visible(page, `usage-${key}`);
        await expect(card).toContainText(vi.adminUsage.items[key as keyof typeof vi.adminUsage.items]);
        await expect(card).not.toHaveAttribute("data-level", "unknown");
        await expect(card.getByRole("meter")).toBeVisible();
      }
      await expect(visible(page, "usage-tables").getByRole("listitem").first()).toBeVisible();
      await visible(page, "usage-refresh").click();
      await expect(visible(page, "usage-database").getByRole("meter")).toBeVisible();
    } finally {
      adminCommand("revoke", email);
    }
  });
});
