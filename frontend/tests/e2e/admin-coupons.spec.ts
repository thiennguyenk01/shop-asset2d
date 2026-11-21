import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin coupons + settings (GĐ5.6, DECISIONS #35) through the UI: an Admin creates a coupon (bad value refused),
 * a shopper uses it in the cart, the Admin turns it off (the cart stops counting it) and deletes it (nobody used
 * it). Settings: a 0 ₫ price is refused; saving the values in use changes nothing. The real price is not changed
 * here — other specs running in parallel read it; the integration tests cover a real change.
 */
const PASSWORD = "matkhau-e2e-123";
const PACK = { slug: "tien-hiep-dao-mon", price: /1\.490\.000/ };
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

test.describe("Admin: coupons and settings", () => {
  test("ordinary users get the 404 on the coupon and settings pages", async ({ page }) => {
    await register(page, `e2e-adm-cpn-user-${uid()}@example.test`);
    for (const path of ["/vi/admin/coupons", "/vi/admin/coupons/new", "/vi/admin/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    }
  });

  test("create a coupon, use it in the cart, turn it off, delete it; settings refuse 0 ₫", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    const adminEmail = `e2e-adm-cpn-${uid()}@example.test`;
    const code = `E2E${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await register(admin, adminEmail);
    adminCommand("grant", adminEmail);
    try {
      // Create from the menu; a bad value is refused and the form keeps what was typed.
      await admin.goto("/vi/admin");
      await visible(admin, "admin-nav-coupons").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/coupons$/);
      await visible(admin, "coupon-new").click();
      const form = visible(admin, "admin-coupon-form");
      await form.getByLabel(vi.adminCoupons.code, { exact: true }).fill(code.toLowerCase());
      await form.getByLabel(vi.adminCoupons.valuePercent).fill("0");
      await form.getByLabel(vi.adminCoupons.maxUsesPerUser).fill("1");
      await form.getByTestId("admin-coupon-submit").click();
      await expect(form.getByText(vi.adminCoupons.errors.percentRange)).toBeVisible();
      await expect(form.getByLabel(vi.adminCoupons.code, { exact: true })).toHaveValue(code.toLowerCase());
      await form.getByLabel(vi.adminCoupons.valuePercent).fill("15");
      await form.getByTestId("admin-coupon-submit").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/coupons\/[a-z0-9]+$/);
      await expect(toast(admin, vi.adminCoupons.flash.created)).toBeVisible();
      await expect(visible(admin, "coupon-code")).toHaveText(code);
      await expect(visible(admin, "coupon-state")).toHaveAttribute("data-state", "active");

      // A shopper (guest cart) uses it: 1.490.000 − 15 % = 1.266.500.
      await page.goto(`/vi/product/${PACK.slug}`);
      await visible(page, "add-to-cart").click();
      await expect(toast(page, vi.cart.added)).toBeVisible();
      await page.goto("/vi/cart");
      await visible(page, "coupon-form").getByLabel(vi.cart.coupon.label).fill(code.toLowerCase());
      await visible(page, "coupon-form").getByRole("button", { name: vi.cart.coupon.apply }).click();
      await expect(visible(page, "cart-total")).toHaveText(/1\.266\.500/);

      // Turned off → the cart keeps the code but stops counting it.
      const edit = visible(admin, "admin-coupon-form");
      await edit.getByLabel(vi.adminCoupons.isActive).uncheck();
      await edit.getByTestId("admin-coupon-submit").click();
      await expect(toast(admin, vi.adminCoupons.saved)).toBeVisible();
      await expect(visible(admin, "coupon-state")).toHaveAttribute("data-state", "inactive");
      await page.reload();
      await expect(visible(page, "coupon-warning")).toContainText(vi.cart.coupon.problems.invalid);
      await expect(visible(page, "cart-total")).toHaveText(PACK.price);

      // Nobody used it (no order) → it can be deleted.
      await visible(admin, "coupon-delete").click();
      await visible(admin, "coupon-delete-confirm").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/coupons$/);
      await expect(toast(admin, vi.adminCoupons.flash.deleted)).toBeVisible();
      const filters = visible(admin, "coupon-filters");
      await filters.getByPlaceholder(vi.adminCoupons.search).fill(code);
      await filters.getByRole("button", { name: vi.adminCoupons.filter.submit }).click();
      await expect(visible(admin, "coupon-row")).toHaveCount(0);

      // Settings: 0 ₫ is refused; saving the values in use writes nothing.
      await visible(admin, "admin-nav-settings").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/settings$/);
      const settings = visible(admin, "settings-form");
      const price = settings.getByLabel(vi.adminSettings.extraPrice);
      const inUse = await price.inputValue();
      await price.fill("0");
      await settings.getByTestId("settings-submit").click();
      await expect(settings.getByText(/^Phải từ 1\.000\s₫ đến 10\.000\.000\s₫\.$/)).toBeVisible();
      await expect(price).toHaveAttribute("aria-invalid", "true");
      await price.fill(inUse);
      await settings.getByTestId("settings-submit").click();
      await expect(toast(admin, vi.adminSettings.unchanged)).toBeVisible();
    } finally {
      adminCommand("revoke", adminEmail);
      await adminContext.close();
    }
  });
});
