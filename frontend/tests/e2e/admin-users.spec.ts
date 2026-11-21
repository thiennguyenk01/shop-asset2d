import { execSync } from "node:child_process";
import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Admin users (GĐ5.5, DECISIONS #34) through the UI: an Admin finds a customer, gifts a Premium pack (it shows in
 * the customer's library as "Gifted"), takes it back, locks the account with a reason (the customer's session dies
 * and signing in shows only the usual error), then unlocks it (signing in works again). An Admin cannot lock
 * themself; ordinary users get the 404. The Admin is made with the real `admin:grant` command.
 */
const PASSWORD = "matkhau-e2e-123";
const PACK = { title: "Kiếm Hiệp Giang Hồ" };
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

/** Submit the sign-in form and wait for the server's answer (React resets the form after it). */
async function login(page: Page, email: string) {
  await page.goto("/vi/login");
  const form = visible(page, "login-form");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/login")),
    form.getByRole("button", { name: vi.auth.login.submit }).click(),
  ]);
}

test.describe("Admin: users", () => {
  test("ordinary users get the 404 on the user pages", async ({ page }) => {
    await register(page, `e2e-adm-usr-user-${uid()}@example.test`);
    for (const path of ["/vi/admin/users", "/vi/admin/users/cmissingmissingmissing00"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: vi.notFound.title })).toBeVisible();
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    }
  });

  test("gift a pack and take it back, lock the account (session ends, generic sign-in error), unlock it", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const customerEmail = `e2e-adm-usr-cust-${uid()}@example.test`;
    await register(page, customerEmail);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    const adminEmail = `e2e-adm-usr-${uid()}@example.test`;
    await register(admin, adminEmail);
    adminCommand("grant", adminEmail);
    try {
      // Find the customer from the menu.
      await admin.goto("/vi/admin");
      await visible(admin, "admin-nav-users").click();
      await expect(admin).toHaveURL(/\/vi\/admin\/users$/);
      const filters = visible(admin, "admin-user-filters");
      await filters.getByPlaceholder(vi.adminUsers.search).fill(customerEmail);
      await filters.getByRole("button", { name: vi.adminUsers.filter }).click();
      const row = visible(admin, "admin-user-row");
      await expect(row).toHaveCount(1);
      await row.click();
      await expect(visible(admin, "admin-user-email")).toHaveText(customerEmail);
      await expect(visible(admin, "admin-user-status")).toHaveAttribute("data-status", "ACTIVE");

      // Gift a Premium pack → it is in the customer's library as "Gifted".
      await expect(visible(admin, "manual-mode")).toHaveAttribute("data-value", "gift"); // "Gift packs" is the default kind
      await expect(visible(admin, "manual-order-form")).toHaveCount(0); // no amount box for a gift
      const gift = visible(admin, "gift-form");
      await gift.getByLabel(PACK.title).check();
      await gift.getByTestId("gift-submit").click();
      await expect(toast(admin, vi.adminUsers.gifted)).toBeVisible();
      const owned = visible(admin, "admin-user-pack").filter({ hasText: PACK.title });
      await expect(owned).toHaveAttribute("data-source", "ADMIN_GRANT");
      await expect(owned).toHaveAttribute("data-revoked", "false");
      await page.goto("/vi/library");
      const item = visible(page, "library-items").getByTestId("library-item").first();
      await expect(item).toContainText(PACK.title);
      await expect(item).toContainText(vi.library.source.ADMIN_GRANT);

      // Take it back → gone from the library.
      await owned.getByTestId("gift-revoke").click();
      await visible(admin, "gift-revoke-confirm").click();
      await expect(toast(admin, vi.adminUsers.giftRevoked.replace("{title}", PACK.title))).toBeVisible();
      await expect(owned).toHaveAttribute("data-revoked", "true");
      await page.reload();
      await expect(page.getByText(vi.library.emptyTitle).filter({ visible: true })).toBeVisible();

      // Lock: a reason is required; then the customer's session is dead and signing in fails like a wrong password.
      await visible(admin, "lock-open").click();
      const lock = visible(admin, "lock-form");
      await lock.getByTestId("lock-confirm").click();
      await expect(lock.getByText(vi.adminUsers.errors.reasonRequired)).toBeVisible();
      await lock.getByLabel(vi.adminUsers.reason).fill("Thử khoá (E2E)");
      await lock.getByTestId("lock-confirm").click();
      await expect(toast(admin, vi.adminUsers.locked)).toBeVisible();
      await expect(visible(admin, "admin-user-status")).toHaveAttribute("data-status", "LOCKED");

      await page.goto("/vi/account");
      await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Faccount$/);
      await expect(visible(page, "account-menu")).toHaveCount(0);
      await login(page, customerEmail);
      await expect(visible(page, "login-form").getByRole("alert")).toHaveText(vi.auth.errors.invalidCredentials);

      // Unlock → signing in works again.
      await visible(admin, "unlock-open").click();
      await visible(admin, "unlock-confirm").click();
      await expect(toast(admin, vi.adminUsers.unlocked)).toBeVisible();
      await expect(visible(admin, "admin-user-status")).toHaveAttribute("data-status", "ACTIVE");
      await login(page, customerEmail);
      await expect(visible(page, "account-menu")).toBeVisible();

      // An Admin cannot lock themself.
      await admin.goto("/vi/admin/users");
      const self = visible(admin, "admin-user-filters");
      await self.getByPlaceholder(vi.adminUsers.search).fill(adminEmail);
      await self.getByRole("button", { name: vi.adminUsers.filter }).click();
      await visible(admin, "admin-user-row").click();
      await expect(visible(admin, "lock-blocked")).toHaveText(vi.adminUsers.lockBlocked.self);
      await expect(visible(admin, "lock-open")).toHaveCount(0);
    } finally {
      adminCommand("revoke", adminEmail);
      await adminContext.close();
    }
  });
});
