import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin orders + refunds (GĐ5.4, DECISIONS #33) through the UI: a customer buys a pack with the Demo gateway, an
 * Admin finds the order, sees its payment, refunds the whole order with a reason → the customer's library loses the
 * pack and the order shows "Refunded". Ordinary users get the 404. The Admin is made with the real `admin:grant`.
 */
const PASSWORD = "matkhau-e2e-123";
const PACK = { slug: "kiem-hiep-giang-ho", title: "Kiếm Hiệp Giang Hồ" };
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

/** Buy now → cart → checkout → Demo gateway → success. Returns the order code. */
async function buyWithDemo(page: Page, slug: string): Promise<string> {
  await page.goto(`/vi/product/${slug}`);
  await visible(page, "buy-now").click();
  await expect(page).toHaveURL(/\/vi\/cart$/);
  await visible(page, "checkout").click();
  await expect(page).toHaveURL(/\/vi\/checkout$/);
  await visible(page, "place-order").click();
  await expect(page).toHaveURL(/\/vi\/checkout\/demo\//);
  const code = (await visible(page, "demo-order-code").textContent())!.trim();
  await visible(page, "demo-succeed").click();
  await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");
  return code;
}

test.describe("Admin: orders + refunds", () => {
  test("ordinary users get the 404 on the order pages", async ({ page }) => {
    await register(page, `e2e-adm-ord-user-${uid()}@example.test`);
    for (const path of ["/vi/admin/orders", "/vi/admin/orders/AG-20260101-AAAAAA"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    }
  });

  test("a customer buys, the Admin refunds the whole order, the customer loses the pack", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await register(page, `e2e-adm-ord-buyer-${uid()}@example.test`);
    const code = await buyWithDemo(page, PACK.slug);
    await page.goto("/vi/library");
    await expect(visible(page, "library-items").getByTestId("library-item").first()).toContainText(PACK.title);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    const adminEmail = `e2e-adm-ord-${uid()}@example.test`;
    await register(admin, adminEmail);
    adminCommand("grant", adminEmail);
    try {
      // Find the order from the menu, by its code.
      await admin.goto("/vi/admin");
      await visible(admin, "admin-nav-orders").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/orders$/);
      await expect(admin.getByRole("heading", { level: 1, name: vi.adminOrders.listTitle })).toBeVisible();
      const filters = visible(admin, "admin-order-filters");
      await filters.getByPlaceholder(vi.adminOrders.search).fill(code.toLowerCase());
      await filters.getByRole("button", { name: vi.adminOrders.filter }).click();
      const row = visible(admin, "admin-order-row");
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-code", code);
      await row.click();

      // The detail: paid, Demo, one successful payment, access active.
      await expect(visible(admin, "admin-order-code")).toHaveText(code);
      await expect(visible(admin, "admin-order-status")).toHaveAttribute("data-status", "PAID");
      await expect(visible(admin, "admin-order-payment")).toHaveAttribute("data-status", "SUCCEEDED");
      await expect(visible(admin, "admin-order-access")).toHaveAttribute("data-access", "active");

      // A reason is required; then the refund goes through once.
      await visible(admin, "refund-open").click();
      const form = visible(admin, "refund-form");
      await expect(form.getByText(vi.adminOrders.refundDemoNote)).toBeVisible();
      await form.getByTestId("refund-confirm").click();
      await expect(form.getByText(vi.adminOrders.errors.reasonRequired)).toBeVisible();
      await form.getByLabel(vi.adminOrders.reason).fill("Khách mua nhầm (E2E)");
      await form.getByTestId("refund-confirm").click();
      await expect(toast(admin, vi.adminOrders.refunded.replace("{code}", code))).toBeVisible();
      await expect(visible(admin, "admin-order-status")).toHaveAttribute("data-status", "REFUNDED");
      await expect(visible(admin, "admin-order-access")).toHaveAttribute("data-access", "revoked");
      await expect(visible(admin, "admin-order-refund-reason")).toHaveText("Khách mua nhầm (E2E)");
      await expect(visible(admin, "refund-blocked")).toHaveAttribute("data-reason", "refunded");
      await expect(visible(admin, "refund-open")).toHaveCount(0);
    } finally {
      adminCommand("revoke", adminEmail);
      await adminContext.close();
    }

    // The customer: the pack left the library, the order says refunded, the pack can be bought again.
    await page.goto("/vi/library");
    await expect(page.getByText(vi.library.emptyTitle).filter({ visible: true })).toBeVisible();
    await page.goto(`/vi/orders/${code}`);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "REFUNDED");
    await expect(page.getByText(vi.checkout.result.refundedTitle).filter({ visible: true })).toBeVisible();
    await page.goto(`/vi/product/${PACK.slug}`);
    await expect(visible(page, "buy-now")).toBeVisible();
  });
});
