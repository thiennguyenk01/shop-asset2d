import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin statistics + action log (GĐ5.7, DECISIONS #36) through the UI: the statistics live on the overview
 * (merged at the user's request, 2026-11-19; there is no separate statistics page): it switches ranges
 * (7 days / 30 days / 12 months) with a chart, its table and both top lists; the action log shows what this Admin
 * just did (a coupon created then deleted) and filters by Admin and action. Ordinary users get the 404.
 */
const PASSWORD = "matkhau-e2e-123";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text }).first();
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

test.describe("Admin: statistics and action log", () => {
  test("ordinary users get the 404 on both pages", async ({ page }) => {
    await register(page, `e2e-adm-sta-user-${uid()}@example.test`);
    for (const path of ["/vi/admin?range=7d", "/vi/admin/audit"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    }
  });

  test("statistics ranges, chart and table; the action log shows and filters this Admin's actions", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const email = `e2e-adm-sta-${uid()}@example.test`;
    const code = `E2ES${Date.now().toString(36).toUpperCase()}`;
    await register(page, email);
    adminCommand("grant", email);
    try {
      // Statistics on the overview: 30 days by default, then 7 days and 12 months. No separate page or menu entry.
      await page.goto("/vi/admin");
      await expect(page.getByRole("heading", { level: 1, name: vi.admin.overview.title })).toBeVisible();
      await expect(visible(page, "admin-tiles")).toBeVisible();
      await expect(page.getByTestId("admin-nav-stats")).toHaveCount(0);
      for (const key of ["real", "demo", "paid", "users"])
        await expect(visible(page, `stats-sum-${key}`)).toBeVisible();
      await expect(visible(page, "stats-range-30d")).toHaveAttribute("aria-current", "page");
      await expect(visible(page, "revenue-chart").getByTestId("chart-period")).toHaveCount(30);
      await expect(visible(page, "chart-legend")).toContainText(vi.adminStats.legendDemo);
      await expect(visible(page, "stats-top-sellers")).toBeVisible();
      await expect(visible(page, "stats-top-free")).toBeVisible();

      await visible(page, "stats-range-7d").click();
      await expect(page).toHaveURL(/\/vi\/admin\?range=7d$/);
      await expect(visible(page, "revenue-chart").getByTestId("chart-period")).toHaveCount(7);
      // No table (user request 2026-11-21): tapping a column shows that day's amounts under the chart.
      await expect(page.getByTestId("stats-table")).toHaveCount(0);
      await expect(visible(page, "chart-hint")).toBeVisible();
      const last = visible(page, "revenue-chart").getByTestId("chart-period").last();
      const lastKey = await last.getAttribute("data-key");
      await last.getByTestId("chart-slot").click();
      await expect(visible(page, "chart-detail")).toHaveAttribute("data-key", lastKey!);
      await expect(visible(page, "chart-detail-real")).toContainText("₫");
      await expect(last.getByTestId("chart-slot")).toHaveAttribute("aria-pressed", "true");
      await page.mouse.move(0, 0); // hover previews another column; move away so the chosen one shows
      await visible(page, "chart-detail-close").click();
      await expect(visible(page, "chart-hint")).toBeVisible();

      await visible(page, "stats-range-12m").click();
      await expect(page).toHaveURL(/\/vi\/admin\?range=12m$/);
      await expect(visible(page, "revenue-chart").getByTestId("chart-period")).toHaveCount(12);
      await expect(visible(page, "admin-nav-overview")).toHaveAttribute("aria-current", "page");

      await page.goto("/en/admin");
      await expect(visible(page, "stats-revenue")).toContainText(en.adminStats.revenueTitle);

      // The old separate page is gone.
      await page.goto("/vi/admin/stats");
      await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();

      // Two actions to log: create a coupon, then delete it (nobody used it).
      await page.goto("/vi/admin/coupons/new");
      const form = visible(page, "admin-coupon-form");
      await form.getByLabel(vi.adminCoupons.code, { exact: true }).fill(code);
      await form.getByLabel(vi.adminCoupons.valuePercent).fill("5");
      await form.getByTestId("admin-coupon-submit").click();
      await expect(toast(page, vi.adminCoupons.flash.created)).toBeVisible();
      await visible(page, "coupon-delete").click();
      await visible(page, "coupon-delete-confirm").click();
      await expect(toast(page, vi.adminCoupons.flash.deleted)).toBeVisible();

      // The log: newest first; the deleted coupon has no link any more.
      await visible(page, "admin-nav-audit").click();
      await expect(page).toHaveURL(/\/vi\/admin\/audit$/);
      const filters = visible(page, "audit-filters");
      await filters.getByRole("combobox", { name: vi.adminAudit.filter.admin }).click();
      await page.getByRole("option", { name: email }).click();
      await filters.getByRole("button", { name: vi.adminAudit.filter.submit }).click();
      await expect(page).toHaveURL(/admin=/);
      const rows = visible(page, "audit-row");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toHaveAttribute("data-action", "coupon.delete");
      await expect(rows.nth(0)).toContainText(vi.adminAudit.action.coupon_delete);
      await expect(rows.nth(0).getByTestId("audit-target")).toHaveCount(0);
      await expect(rows.nth(1)).toHaveAttribute("data-action", "coupon.create");
      await expect(rows.nth(1)).toContainText(code);

      await visible(page, "audit-filters").getByRole("combobox", { name: vi.adminAudit.filter.action }).click();
      await page.getByRole("option", { name: vi.adminAudit.action.coupon_create, exact: true }).click();
      await visible(page, "audit-filters").getByRole("button", { name: vi.adminAudit.filter.submit }).click();
      await expect(page).toHaveURL(/action=coupon\.create/);
      await expect(visible(page, "audit-row")).toHaveCount(1);
    } finally {
      adminCommand("revoke", email);
    }
  });
});
