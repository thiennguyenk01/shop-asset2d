import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Account statistics (/stats, account menu → "Thống kê"): the user's own library, downloads, spending and
 * orders. Demo orders are never counted as money spent.
 */
const FREE = "khoi-dau-tien-hiep";
const PREMIUM = { slug: "kiem-hiep-giang-ho", title: "Kiếm Hiệp Giang Hồ" };
const PASSWORD = "matkhau-e2e-123";
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function register(page: Page) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Lâm Phong");
  await form.getByLabel(vi.auth.email).fill(`e2e-stats-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

test.describe("Account statistics", () => {
  test("guests are sent to sign in", async ({ page }) => {
    await page.goto("/vi/stats");
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Fstats$/);
  });

  test("menu entry under Account; numbers follow downloads and a demo purchase", async ({ page }) => {
    await register(page);

    // The account menu lists Statistics right after Account.
    await visible(page, "account-menu").click();
    const items = page.getByRole("menuitem");
    await expect(items.nth(0)).toHaveText(vi.nav.account);
    await expect(items.nth(1)).toHaveText(vi.nav.stats);
    await expect(items.nth(2)).toHaveText(vi.nav.orders);
    await items.nth(1).click();
    await expect(page).toHaveURL(/\/vi\/stats$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.stats);
    await expect(visible(page, "stat-library-value")).toHaveText("0");
    await expect(page.getByText(vi.stats.topEmpty).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(vi.stats.ordersEmpty).filter({ visible: true })).toBeVisible();

    // One free download + one demo purchase.
    await page.goto(`/vi/product/${FREE}`);
    await Promise.all([page.waitForEvent("download"), visible(page, "download-free").click()]);
    await page.goto(`/vi/product/${PREMIUM.slug}`);
    await visible(page, "buy-now").click();
    await visible(page, "checkout").click(); // buy now opens the cart first
    await visible(page, "place-order").click();
    await visible(page, "demo-succeed").click();
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");

    await page.goto("/vi/stats");
    await expect(visible(page, "stat-library-value")).toHaveText("2");
    await expect(visible(page, "stat-library")).toContainText("1 miễn phí · 1 đã mua");
    await expect(visible(page, "stat-downloads-value")).toHaveText("1");
    await expect(visible(page, "stat-downloads")).toContainText("1 lượt trong 30 ngày qua");
    await expect(visible(page, "stat-spent-value")).toHaveText(/^0\s₫$/); // a demo order is not money spent
    await expect(visible(page, "stat-spent")).toContainText("1.290.000");
    await expect(visible(page, "stat-spent")).toContainText("Demo");

    await expect(visible(page, "top-packs")).toContainText("1 lượt");
    await expect(visible(page, "order-status-counts")).toContainText(vi.checkout.result.status.PAID);
    await visible(page, "orders-card").getByRole("link", { name: /AG-\d{8}-/ }).click();
    await expect(page).toHaveURL(/\/vi\/orders\/AG-/);
  });
});
