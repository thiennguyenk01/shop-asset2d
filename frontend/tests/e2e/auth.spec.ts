import { expect, test, withAnyMinutes, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Phase 3.1 — sign up, sign in, sign out (CLAUDE.md §5, §13 sessionVersion lives in unit tests).
 * Every test signs up its own throw-away account on the dev database (…@example.test).
 * Forms are located with `visible: true`: Next 16 keeps recently visited pages mounted but hidden (<Activity>),
 * so an earlier login/register page can still be in the DOM.
 */
const PASSWORD = "matkhau-e2e-123";
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

async function register(page: Page, email: string, name = "Lâm Phong") {
  await page.goto("/vi/register");
  const form = page.getByTestId("register-form").filter({ visible: true });
  await form.getByLabel(vi.auth.name).fill(name);
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

async function signOut(page: Page) {
  await visible(page, "account-menu").click();
  await visible(page, "sign-out").click();
  await expect(visible(page, "sign-in-link")).toBeVisible();
}

async function login(page: Page, email: string, password = PASSWORD) {
  const form = page.getByTestId("login-form").filter({ visible: true });
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(password);
  // Wait for the server action's answer: React resets the form after it, which would wipe the next fill.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/login")),
    form.getByRole("button", { name: vi.auth.login.submit }).click(),
  ]);
}

/**
 * A sign-in that must fail: after the server answers, React resets the form (the password empties). Wait for
 * that reset before typing again — otherwise, on a busy machine, the next fill lands first and gets wiped.
 */
async function loginFails(page: Page, email: string, password = PASSWORD) {
  await login(page, email, password);
  const form = page.getByTestId("login-form").filter({ visible: true });
  await expect(form.getByRole("alert")).toHaveText(vi.auth.errors.invalidCredentials);
  await expect(form.getByLabel(vi.auth.password, { exact: true })).toHaveValue("");
}

test.describe("Account: sign up / sign in / sign out", () => {
  test("sign up signs you in, the menu shows who you are, sign out signs you out", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/vi\/shop$/);
    await expect(page.getByTestId("toast").filter({ hasText: vi.auth.register.success })).toBeVisible();
    await expect(visible(page, "account-menu")).toHaveText("L"); // first letter of the name

    await visible(page, "account-menu").click();
    await expect(page.getByRole("menu")).toContainText(email);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0); // closing animation done before reopening

    await signOut(page);
    await expect(page.getByTestId("toast").filter({ hasText: vi.header.signedOut })).toBeVisible();
  });

  test("wrong password shows one generic error and keeps the email; the right one signs in", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);

    await page.goto("/vi/login");
    await loginFails(page, email, "sai-mat-khau-999");
    await expect(page.getByTestId("login-form").filter({ visible: true }).getByLabel(vi.auth.email)).toHaveValue(email);
    // Unknown email: same message (no account enumeration).
    await loginFails(page, uniqueEmail());

    await login(page, email);
    await expect(visible(page, "account-menu")).toBeVisible();
    await expect(page).toHaveURL(/\/vi\/shop$/);
    // The login page may stay mounted but hidden (Activity): the typed password must not linger in it.
    const typed = await page.locator('input[name="password"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(typed.every((v) => v === "")).toBe(true);
  });

  test("signing in from a pack page comes back to that pack", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);

    await page.goto("/vi/product/tien-hiep-dao-mon");
    await visible(page, "sign-in-link").click();
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Fproduct%2Ftien-hiep-dao-mon$/);
    await login(page, email);
    await expect(page).toHaveURL(/\/vi\/product\/tien-hiep-dao-mon$/);
    await expect(visible(page, "account-menu")).toBeVisible();
  });

  test("never redirects to another site after signing in", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);
    await page.goto(`/vi/login?callbackUrl=${encodeURIComponent("https://evil.example/steal")}`);
    await login(page, email);
    await expect(page).toHaveURL(/localhost:\d+\/vi\/shop$/);
  });

  test("sign-up validation and an email that already has an account", async ({ page }) => {
    await page.goto("/vi/register");
    const form = page.getByTestId("register-form").filter({ visible: true });
    await form.getByLabel(vi.auth.email).fill("khong-phai-email");
    await form.getByLabel(vi.auth.password, { exact: true }).fill("ngan");
    await form.getByLabel(vi.auth.confirmPassword).fill("khac");
    await form.getByRole("button", { name: vi.auth.register.submit }).click();
    await expect(form).toContainText(vi.auth.errors.nameRequired);
    await expect(form).toContainText(vi.auth.errors.emailInvalid);
    await expect(form).toContainText(vi.auth.errors.passwordTooShort);
    await expect(form).toContainText(vi.auth.errors.passwordMismatch);
    await expect(form.getByLabel(vi.auth.email)).toHaveAttribute("aria-invalid", "true");

    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);
    await page.goto("/vi/register");
    await form.getByLabel(vi.auth.name).fill("Người khác");
    await form.getByLabel(vi.auth.email).fill(email.toUpperCase()); // same email, other case
    await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
    await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
    await form.getByRole("button", { name: vi.auth.register.submit }).click();
    await expect(form.getByRole("alert")).toHaveText(vi.auth.errors.emailTaken);
  });

  test("a signed-in visitor opening the sign-in page goes back to the shop", async ({ page }) => {
    await register(page, uniqueEmail());
    await page.goto("/vi/login");
    await expect(page).toHaveURL(/\/vi\/shop$/);
  });

  test("password can be shown and hidden", async ({ page }) => {
    await page.goto("/vi/login");
    const input = page.getByTestId("login-form").filter({ visible: true }).getByLabel(vi.auth.password, { exact: true });
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: vi.auth.showPassword }).click();
    await expect(input).toHaveAttribute("type", "text");
  });

  test("too many wrong passwords: refused for a while, even with the right one and through the Auth.js endpoint", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);
    await page.goto("/vi/login");
    for (let i = 0; i < 9; i++) await loginFails(page, email, "sai-mat-khau-123");

    // The 10th wrong password reaches the limit: the form says how long to wait.
    const form = page.getByTestId("login-form").filter({ visible: true });
    const wait = withAnyMinutes(vi.auth.errors.tooManyAttempts);
    await login(page, email, "sai-mat-khau-123");
    await expect(form.getByRole("alert")).toHaveText(wait);
    await expect(form.getByLabel(vi.auth.password, { exact: true })).toHaveValue("");

    // The right password is refused as well while the limit lasts…
    await login(page, email);
    await expect(form.getByRole("alert")).toHaveText(wait);
    await expect(visible(page, "account-menu")).toHaveCount(0);

    // …also when posting straight to Auth.js (no way around the form).
    const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrfToken as string;
    await page.request.post("/api/auth/callback/credentials", { form: { email, password: PASSWORD, csrfToken: csrf }, maxRedirects: 0 });
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();

    // Another account is not affected.
    await register(page, uniqueEmail());
    await expect(visible(page, "account-menu")).toBeVisible();
  });

  test("sign-ups from one network are limited: 10 tries an hour, 'email taken' answers included", async ({ page }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    await register(page, email); // 1
    await page.context().clearCookies(); // signed out; same client IP

    const tryAgain = async () => {
      await page.goto("/vi/register");
      const form = page.getByTestId("register-form").filter({ visible: true });
      await form.getByLabel(vi.auth.name).fill("Người khác");
      await form.getByLabel(vi.auth.email).fill(email);
      await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
      await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/register")),
        form.getByRole("button", { name: vi.auth.register.submit }).click(),
      ]);
      return form.getByRole("alert");
    };
    for (let i = 2; i <= 10; i++) await expect(await tryAgain()).toHaveText(vi.auth.errors.emailTaken);
    // The 11th: refused before looking at the email at all.
    await expect(await tryAgain()).toHaveText(withAnyMinutes(vi.auth.errors.tooManyRequests));
  });

  test("English sign-in page is fully translated", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.auth.login.title);
    await expect(page.getByRole("button", { name: en.auth.login.submit })).toBeVisible();
    await expect(page.getByRole("link", { name: en.auth.login.registerLink })).toBeVisible();
  });
});
