import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, test, withAnyMinutes, type Page } from "./fixtures";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * GĐ6.2 — forgot / reset password through the UI. The server under test writes its mails to the dev outbox
 * (`.mail-outbox/`, MAIL_DRIVER=outbox); the test reads the link from there, like a customer opening the mail.
 */
const PASSWORD = "matkhau-e2e-123";
const NEW_PASSWORD = "matkhau-moi-e2e-456";
const OUTBOX = path.resolve(process.env.MAIL_OUTBOX_DIR ?? ".mail-outbox");
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const uniqueEmail = () => `e2e-reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** The outbox mails sent to one address, oldest first. */
function mailsTo(email: string): { id: string; locale: string; subject: string; token: string }[] {
  let files: string[] = [];
  try {
    files = readdirSync(OUTBOX)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  // Other workers delete their own mails while we read: a file gone in between is simply not ours.
  const read = (f: string) => {
    try {
      return readFileSync(path.join(OUTBOX, f), "utf8");
    } catch {
      return null;
    }
  };
  const out: { id: string; locale: string; subject: string; token: string }[] = [];
  for (const f of files) {
    const json = read(f);
    if (!json) continue;
    const m = JSON.parse(json);
    if (m.to !== email) continue;
    const html = read(`${m.id}.html`);
    if (!html) continue;
    out.push({
      id: m.id,
      locale: m.locale,
      subject: m.subject,
      token: /\/reset-password\/([A-Za-z0-9_-]{43})"/.exec(html)![1],
    });
  }
  return out;
}
function removeMails(email: string) {
  for (const m of mailsTo(email))
    for (const ext of ["html", "txt", "json"]) rmSync(path.join(OUTBOX, `${m.id}.${ext}`), { force: true });
}

async function register(page: Page, email: string) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Tiêu Viêm");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

async function askForLink(page: Page, email: string) {
  const form = visible(page, "forgot-form");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByRole("button", { name: vi.auth.forgot.submit }).click();
  await expect(visible(page, "forgot-sent")).toContainText(
    vi.auth.forgot.sentText.replace("{email}", email).replace("{minutes}", "30"),
  );
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

test.describe("Forgot / reset password (GĐ6.2)", () => {
  test("from the sign-in page: mail with a link → new password → old one stops working, the link works once", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    try {
      await register(page, email);
      await page.context().clearCookies(); // signed out (another device, say)

      // "Forgot password?" sits on the sign-in form.
      await page.goto("/vi/login");
      await visible(page, "forgot-link").click();
      await expect(page).toHaveURL(/\/vi\/forgot-password$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.auth.forgot.title);
      await askForLink(page, email);

      // The mail: one, in Vietnamese (the page's language), with the link.
      await expect.poll(() => mailsTo(email).length).toBe(1);
      const [mail] = mailsTo(email);
      expect(mail.locale).toBe("vi");

      // The reset page: passwords must match, then the new one is saved and the sign-in page opens.
      await page.goto(`/vi/reset-password/${mail.token}`);
      const form = visible(page, "reset-form");
      await form.getByLabel(vi.auth.reset.newPassword, { exact: true }).fill(NEW_PASSWORD);
      await form.getByLabel(vi.auth.confirmPassword).fill("khong-khop-123");
      await form.getByRole("button", { name: vi.auth.reset.submit }).click();
      await expect(form.getByText(vi.auth.errors.passwordMismatch)).toBeVisible();
      await expect(form.getByLabel(vi.auth.reset.newPassword, { exact: true })).toHaveValue(""); // React reset the form
      await form.getByLabel(vi.auth.reset.newPassword, { exact: true }).fill(NEW_PASSWORD);
      await form.getByLabel(vi.auth.confirmPassword).fill(NEW_PASSWORD);
      await form.getByRole("button", { name: vi.auth.reset.submit }).click();
      await expect(page).toHaveURL(/\/vi\/login$/);
      await expect(page.getByTestId("toast").filter({ hasText: vi.auth.reset.success })).toBeVisible();

      // Old password refused, new one accepted.
      await login(page, email, PASSWORD);
      await expect(visible(page, "login-form").getByRole("alert")).toHaveText(vi.auth.errors.invalidCredentials);
      await expect(visible(page, "login-form").getByLabel(vi.auth.password, { exact: true })).toHaveValue("");
      await login(page, email, NEW_PASSWORD);
      await expect(visible(page, "account-menu")).toBeVisible();

      // The same link again: "no longer works", with a way to ask for a new one.
      await page.goto(`/vi/reset-password/${mail.token}`);
      await expect(visible(page, "reset-invalid")).toContainText(vi.auth.reset.invalidTitle);
      await expect(
        visible(page, "reset-invalid").getByRole("link", { name: vi.auth.reset.requestNew }),
      ).toHaveAttribute("href", "/vi/forgot-password");
    } finally {
      removeMails(email);
    }
  });

  test("an unknown email gets exactly the same answer, and no mail", async ({ page }) => {
    const email = uniqueEmail(); // never registered
    await page.goto("/vi/forgot-password");
    await askForLink(page, email);
    expect(mailsTo(email)).toEqual([]);
  });

  test("requests from one network are limited: the 11th within an hour waits, whatever the email", async ({ page }) => {
    test.setTimeout(90_000);
    for (let i = 0; i < 10; i++) {
      await page.goto("/vi/forgot-password");
      await askForLink(page, uniqueEmail());
    }
    await page.goto("/vi/forgot-password");
    const form = visible(page, "forgot-form");
    await form.getByLabel(vi.auth.email).fill(uniqueEmail());
    await form.getByRole("button", { name: vi.auth.forgot.submit }).click();
    await expect(form.getByRole("alert")).toHaveText(withAnyMinutes(vi.auth.errors.tooManyRequests));
    await expect(visible(page, "forgot-sent")).toHaveCount(0);
  });

  test("English page → English mail; a made-up link shows the 'no longer works' state, never indexed", async ({
    page,
  }) => {
    const email = uniqueEmail();
    try {
      await register(page, email);
      await page.context().clearCookies();
      await page.goto("/en/forgot-password");
      const form = visible(page, "forgot-form");
      await form.getByLabel(en.auth.email).fill(email);
      await form.getByRole("button", { name: en.auth.forgot.submit }).click();
      await expect(visible(page, "forgot-sent")).toContainText(en.auth.forgot.sentTitle);
      await expect.poll(() => mailsTo(email).length).toBe(1);
      expect(mailsTo(email)[0]).toMatchObject({ locale: "en", subject: "Reset your Asset Game MMORPG 2D password" });

      await page.goto(`/en/reset-password/${"x".repeat(43)}`);
      await expect(visible(page, "reset-invalid")).toContainText(en.auth.reset.invalidTitle);
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
      await expect(page.locator('meta[name="referrer"][content="no-referrer"]')).toHaveCount(1);
    } finally {
      removeMails(email);
    }
  });
});
