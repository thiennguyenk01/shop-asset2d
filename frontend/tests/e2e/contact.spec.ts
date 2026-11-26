import { execSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Contact channels of the chat button set in Admin → Settings (user choice 2026-11-26): the Admin types only the
 * number / username / address (a bad one is refused), orders and turns channels on; the shop lists exactly those,
 * with the links it built, and hides the button when none is on. The channels are one shared setting of the dev
 * database: the test runs on desktop only and puts back what was there before.
 */
const PASSWORD = "matkhau-e2e-123";
const KINDS = ["messenger", "zalo", "hotline", "telegram", "email"] as const;
type Kind = (typeof KINDS)[number];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text }).first();
const adminCommand = (action: "grant" | "revoke", email: string) =>
  execSync(`npx tsx backend/scripts/admin-grant.ts ${action} ${email}`, { stdio: "pipe" }).toString();
const name = (k: Kind) => vi.contactChat.channels[k].name;

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

const row = (form: Locator, k: Kind) => form.getByTestId(`contact-row-${k}`);
const field = (form: Locator, k: Kind) => row(form, k).getByLabel(name(k), { exact: true });
const show = (form: Locator, k: Kind) => row(form, k).getByLabel(vi.adminSettings.contactShow);
const order = async (form: Locator) =>
  (await form
    .locator('[data-testid^="contact-row-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(12)))) as Kind[];

/** Move channel `k` to position `to` (0 = top) with the up / down buttons. */
async function moveTo(form: Locator, k: Kind, to: number) {
  for (;;) {
    const at = (await order(form)).indexOf(k);
    if (at === to) return;
    const label = at > to ? vi.adminSettings.contactUp : vi.adminSettings.contactDown;
    await row(form, k)
      .getByRole("button", { name: label.replace("{name}", name(k)) })
      .click();
  }
}

test.describe("Admin: contact channels of the chat button", () => {
  test("the Admin fills, orders and turns channels on; the shop lists exactly those", async ({ page, isMobile }) => {
    test.skip(isMobile, "one shared setting: desktop only");
    test.setTimeout(180_000);
    const email = `e2e-contact-${uid()}@example.test`;
    await register(page, email);
    adminCommand("grant", email);
    await page.goto("/vi/admin/settings");
    const form = visible(page, "contact-form");
    await expect(form).toBeVisible();
    const before = { order: await order(form), values: {} as Record<Kind, string>, on: {} as Record<Kind, boolean> };
    for (const k of KINDS) {
      before.values[k] = await field(form, k).inputValue();
      before.on[k] = await show(form, k).isChecked();
    }

    try {
      // Only Zalo, Telegram and Email; a bad Telegram name is refused and what was typed stays.
      for (const k of KINDS) await field(form, k).fill("");
      await field(form, "zalo").fill("+84 912 345 678");
      await field(form, "telegram").fill("ab");
      await field(form, "email").fill("HoTro@Example.test");
      for (const k of ["zalo", "telegram", "email"] as const) await show(form, k).check();
      await form.getByTestId("contact-submit").click();
      await expect(row(form, "telegram")).toContainText(vi.adminSettings.contactErrors.invalid);
      await expect(field(form, "zalo")).toHaveValue("+84 912 345 678");

      await field(form, "telegram").fill("https://t.me/asset_game2d");
      await expect(row(form, "telegram")).toContainText("https://t.me/asset_game2d"); // "Try it" link
      await moveTo(form, "email", 0);
      await moveTo(form, "zalo", 1);
      await moveTo(form, "telegram", 2);
      await form.getByTestId("contact-submit").click();
      await expect(toast(page, vi.adminSettings.saved)).toBeVisible();
      // Stored the way the shop uses it.
      await expect(field(form, "zalo")).toHaveValue("0912345678");
      await expect(field(form, "email")).toHaveValue("hotro@example.test");
      await expect(field(form, "telegram")).toHaveValue("asset_game2d");
      // A save must not break pages whose address carries a code (their shell does not depend on the channels).
      const result = await page.goto("/vi/checkout/result/AG-20991231-ZZZZZZ");
      expect(result!.status()).toBeLessThan(500);
      await page.goto("/vi/admin/settings");

      await page.goto("/vi/shop");
      await visible(page, "contact-chat").click();
      const panel = page.getByTestId("contact-chat-panel");
      const links = panel.locator('[data-testid^="contact-channel-"]');
      await expect(links).toHaveCount(3);
      expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).toEqual([
        "contact-channel-email",
        "contact-channel-zalo",
        "contact-channel-telegram",
      ]);
      await expect(panel.getByTestId("contact-channel-email")).toHaveAttribute("href", "mailto:hotro@example.test");
      await expect(panel.getByTestId("contact-channel-email")).toContainText("hotro@example.test");
      await expect(panel.getByTestId("contact-channel-zalo")).toHaveAttribute("href", "https://zalo.me/0912345678");
      await expect(panel.getByTestId("contact-channel-zalo")).toHaveAttribute("target", "_blank");
      await expect(panel.getByTestId("contact-channel-telegram")).toHaveAttribute("href", "https://t.me/asset_game2d");
      await expect(panel).not.toContainText(name("messenger"));
      await page.keyboard.press("Escape");

      // Nothing turned on: no chat button at all.
      await page.goto("/vi/admin/settings");
      for (const k of KINDS) await show(visible(page, "contact-form"), k).uncheck();
      await expect(visible(page, "contact-visible-count")).toHaveText(/^Đang hiện 0 kênh/);
      await visible(page, "contact-form").getByTestId("contact-submit").click();
      await expect(toast(page, vi.adminSettings.saved)).toBeVisible();
      await page.goto("/vi/shop");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("contact-chat")).toHaveCount(0);
    } finally {
      // Put back what was there before.
      await page.goto("/vi/admin/settings");
      const f = visible(page, "contact-form");
      for (const k of KINDS) {
        await field(f, k).fill(before.values[k]);
        await show(f, k).setChecked(before.on[k]);
      }
      for (const [i, k] of before.order.entries()) await moveTo(f, k, i);
      await f.getByTestId("contact-submit").click();
      await expect(page.getByTestId("toast").first()).toBeVisible();
      adminCommand("revoke", email);
    }
  });
});
