import { expect, test, withAnyMinutes, type Browser, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Phase 3.2 — account page: profile + change password (forgot password moved to Phase 6).
 * Includes the CLAUDE.md §13 rule end to end: changing the password signs out OTHER devices.
 * Forms are located with `visible: true` (Next keeps recently visited pages mounted but hidden).
 */
const PASSWORD = "matkhau-e2e-123";
const NEW_PASSWORD = "matkhau-moi-456";
const uniqueEmail = () => `e2e-acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

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

async function login(page: Page, email: string, password: string) {
  const form = visible(page, "login-form");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/login")),
    form.getByRole("button", { name: vi.auth.login.submit }).click(),
  ]);
}

async function submitPassword(page: Page, current: string, next: string, confirm = next) {
  const form = visible(page, "password-form");
  await form.getByLabel(vi.account.currentPassword, { exact: true }).fill(current);
  await form.getByLabel(vi.account.newPassword, { exact: true }).fill(next);
  await form.getByLabel(vi.account.confirmNewPassword).fill(confirm);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/account")),
    form.getByRole("button", { name: vi.account.changePassword }).click(),
  ]);
}

async function newPage(browser: Browser, baseURL: string | undefined) {
  const ctx = await browser.newContext({ baseURL });
  return ctx.newPage();
}

test.describe("Account page", () => {
  test("signed out: the account page asks you to sign in and comes back", async ({ page }) => {
    await page.goto("/vi/account");
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Faccount$/);
  });

  test("the menu opens the account page; editing the name updates the avatar", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await visible(page, "account-menu").click();
    await visible(page, "account-link").click();
    await expect(page).toHaveURL(/\/vi\/account$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.account);

    const form = visible(page, "profile-form");
    await expect(form.getByLabel(vi.auth.email)).toHaveValue(email);
    await expect(form.getByLabel(vi.auth.email)).toBeDisabled();
    await form.getByLabel(vi.auth.name).fill("   ");
    await form.getByRole("button", { name: vi.account.save }).click();
    await expect(form).toContainText(vi.auth.errors.nameRequired);

    await form.getByLabel(vi.auth.name).fill("Vân Hà");
    await form.getByRole("button", { name: vi.account.save }).click();
    await expect(page.getByTestId("toast").filter({ hasText: vi.account.saved })).toBeVisible();
    await expect(visible(page, "account-menu")).toHaveText("V");
    await page.reload();
    await expect(visible(page, "profile-form").getByLabel(vi.auth.name)).toHaveValue("Vân Hà");
  });

  test("change password: wrong current one, mismatch, then success keeps this device signed in", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await page.goto("/vi/account");

    await submitPassword(page, "sai-mat-khau-0", NEW_PASSWORD);
    await expect(visible(page, "password-form").getByRole("alert")).toHaveText(vi.account.errors.wrongPassword);

    await submitPassword(page, PASSWORD, NEW_PASSWORD, "khong-khop-999");
    await expect(visible(page, "password-form")).toContainText(vi.auth.errors.passwordMismatch);

    await submitPassword(page, PASSWORD, NEW_PASSWORD);
    await expect(page.getByTestId("toast").filter({ hasText: vi.account.passwordChanged })).toBeVisible();
    await page.reload();
    await expect(visible(page, "account-menu")).toBeVisible(); // still signed in here

    // Old password no longer works, the new one does.
    await visible(page, "account-menu").click();
    await visible(page, "sign-out").click();
    await expect(visible(page, "sign-in-link")).toBeVisible();
    await page.goto("/vi/login");
    await login(page, email, PASSWORD);
    await expect(visible(page, "login-form").getByRole("alert")).toHaveText(vi.auth.errors.invalidCredentials);
    await login(page, email, NEW_PASSWORD);
    await expect(visible(page, "account-menu")).toBeVisible();
  });

  test("change password: after 10 wrong current passwords, it is refused for a while (even the right one)", async ({ page }) => {
    test.setTimeout(90_000);
    await register(page, uniqueEmail());
    await page.goto("/vi/account");
    const form = visible(page, "password-form");
    const current = form.getByLabel(vi.account.currentPassword, { exact: true });
    for (let i = 0; i < 9; i++) {
      await submitPassword(page, `sai-mat-khau-${i}`, NEW_PASSWORD);
      await expect(form.getByRole("alert")).toHaveText(vi.account.errors.wrongPassword);
      await expect(current).toHaveValue(""); // React reset the form: safe to type again
    }
    const wait = withAnyMinutes(vi.account.errors.tooManyAttempts);
    await submitPassword(page, "sai-mat-khau-9", NEW_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText(wait);
    await expect(current).toHaveValue("");
    await submitPassword(page, PASSWORD, NEW_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText(wait);
  });

  test("changing the password signs out the other device (sessionVersion)", async ({ page, browser, baseURL }) => {
    const email = uniqueEmail();
    await register(page, email);

    const other = await newPage(browser, baseURL); // second device, same account
    await other.goto("/vi/login");
    await login(other, email, PASSWORD);
    await expect(visible(other, "account-menu")).toBeVisible();

    await page.goto("/vi/account");
    await submitPassword(page, PASSWORD, NEW_PASSWORD);
    await expect(page.getByTestId("toast").filter({ hasText: vi.account.passwordChanged })).toBeVisible();

    await other.goto("/vi/account");
    await expect(other).toHaveURL(/\/vi\/login\?callbackUrl=%2Faccount$/); // old session is dead
    // While the streamed redirect settles the top bar can briefly exist twice; check the visible one.
    await expect(other.getByTestId("sign-in-link").filter({ visible: true }).first()).toBeVisible();
    await expect(visible(other, "account-menu")).toHaveCount(0);

    await page.reload();
    await expect(visible(page, "account-menu")).toBeVisible(); // this device stays signed in
    await other.context().close();
  });
});
