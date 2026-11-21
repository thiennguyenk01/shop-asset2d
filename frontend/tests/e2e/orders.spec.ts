import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Phase 4.3 — owned Premium packs and order history (CLAUDE.md §5.7, §5.8): a bought pack shows
 * "You own this pack" + Download instead of buy buttons; /orders lists the user's orders and opens each one;
 * the library links a purchased pack to its order.
 */
const PACK = { slug: "son-hai-than-thoai" };
const PASSWORD = "matkhau-e2e-123";
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function register(page: Page) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Lâm Phong");
  await form.getByLabel(vi.auth.email).fill(`e2e-orders-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

test.describe("Owned packs + order history", () => {
  test("guests are sent to sign in", async ({ page }) => {
    await page.goto("/vi/orders");
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Forders$/);
  });

  test("buy a pack → it shows as owned and downloads; the order is listed, opens, and links back", async ({ page }) => {
    await register(page);
    await page.goto("/vi/orders");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.orders);
    await expect(page.getByText(vi.orders.emptyTitle).filter({ visible: true })).toBeVisible();

    await page.goto(`/vi/product/${PACK.slug}`);
    await visible(page, "buy-now").click();
    await visible(page, "checkout").click(); // buy now opens the cart first
    await visible(page, "place-order").click();
    await visible(page, "demo-succeed").click();
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");
    const code = (await visible(page, "order-code").textContent())!.match(/AG-\d{8}-[A-Z0-9]{6}/)![0];

    // Owned: download from the pack page itself.
    await page.goto(`/vi/product/${PACK.slug}`);
    await expect(visible(page, "owned-pack")).toBeVisible();
    await expect(visible(page, "buy-now")).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent("download"), visible(page, "owned-download").click()]);
    expect(download.suggestedFilename()).toBe(`${PACK.slug}-demo-readme.txt`);

    // Order history: the avatar menu → Orders → the order → back.
    await visible(page, "account-menu").click();
    await page.getByRole("menuitem", { name: vi.nav.orders }).click();
    await expect(page).toHaveURL(/\/vi\/orders$/);
    const rows = visible(page, "order-list").getByTestId("order-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(code);
    await expect(rows.first()).toContainText(vi.checkout.result.status.PAID);
    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`/vi/orders/${code}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.orders);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");
    await visible(page, "back-to-orders").click();
    await expect(page).toHaveURL(/\/vi\/orders$/);

    // The library links the purchased pack to its order.
    await page.goto("/vi/library");
    await visible(page, "library-order-link").click();
    await expect(page).toHaveURL(new RegExp(`/vi/orders/${code}$`));
  });

  test("another user's order is not visible", async ({ page, browser }) => {
    await register(page);
    await page.goto(`/vi/product/${PACK.slug}`);
    await visible(page, "buy-now").click();
    await visible(page, "checkout").click(); // buy now opens the cart first
    await visible(page, "place-order").click();
    const code = (await visible(page, "demo-order-code").textContent())!.trim();

    const other = await browser.newPage();
    await register(other);
    await other.goto(`/vi/orders/${code}`);
    await expect(other.getByText(vi.checkout.result.notFoundTitle).filter({ visible: true })).toBeVisible();
    await other.goto("/vi/orders");
    await expect(other.getByText(vi.orders.emptyTitle).filter({ visible: true })).toBeVisible();
    await other.close();
  });
});
