import { expect, test, type Page } from "./fixtures";
import { E2E_GOOGLE_CLIENT_ID } from "../../playwright.config";
import en from "../../messages/en.json" with { type: "json" };
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * "Continue with Google" (user choice 2026-11-26). The E2E server runs with a fake Google client
 * (playwright.config.ts), so the button shows; the browser is stopped at Google's door, where the test checks what the
 * site asked Google for. Signing in for real needs a real Google account and is covered by the integration tests of
 * the account logic (backend/tests/integration/google-sign-in.test.ts).
 */
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test.describe("Continue with Google", () => {
  test("sign-in and sign-up pages offer Google above the email form", async ({ page }) => {
    for (const path of ["/vi/login", "/vi/register"]) {
      await page.goto(path);
      const google = visible(page, "google-sign-in");
      await expect(google.getByRole("button", { name: vi.auth.google.button })).toBeVisible();
      await expect(google).toContainText(vi.auth.google.or);
      const form = visible(page, path.endsWith("login") ? "login-form" : "register-form");
      // Google first, then the email form.
      expect((await google.boundingBox())!.y).toBeLessThan((await form.boundingBox())!.y);
    }
    await page.goto("/en/login");
    await expect(visible(page, "google-sign-in").getByRole("button", { name: en.auth.google.button })).toBeVisible();
  });

  test("the button sends the browser to Google with the shop's client, its own callback and the profile scopes", async ({ page }) => {
    let asked: URL | null = null;
    await page.route("https://accounts.google.com/**", async (route) => {
      asked = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Google (stopped by the test)</title>" });
    });
    await page.goto("/vi/login?callbackUrl=/library");
    await visible(page, "google-sign-in").getByRole("button", { name: vi.auth.google.button }).click();
    await expect.poll(() => asked?.toString() ?? "", { timeout: 20_000 }).toContain("accounts.google.com");
    const url = asked!;
    expect(url.searchParams.get("client_id")).toBe(E2E_GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/auth/callback/google");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    // State / PKCE protect the way back from Google.
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  test("a Google attempt that did not sign in comes back with the reason", async ({ page }) => {
    await page.goto("/vi/login?error=google-locked");
    await expect(visible(page, "google-sign-in").getByRole("alert")).toHaveText(vi.auth.google.errors.locked);
    await page.goto("/vi/login?error=google-paused");
    await expect(visible(page, "google-sign-in").getByRole("alert")).toHaveText(vi.auth.google.errors.paused);
    // Anything else the sign-in library reports is a generic failure.
    await page.goto("/en/login?error=AccessDenied");
    await expect(visible(page, "google-sign-in").getByRole("alert")).toHaveText(en.auth.google.errors.failed);
  });
});
