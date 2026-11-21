import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Free downloads (CLAUDE.md §5, §7; decision 2026-11-14 "giới hạn lượt tải"): guests get the sign-in invite
 * and download nothing; signing in from the box comes back and downloads, saving the pack to the library.
 * Each account downloads a free pack twice, for life; then the pack page and the library say so.
 * File links are short-lived and never in the HTML.
 */
const FREE = { slug: "khoi-dau-tien-hiep", title: "Khởi Đầu Tiên Hiệp" };
const PREMIUM = "tien-hiep-dao-mon";
const PASSWORD = "matkhau-e2e-123";
const uniqueEmail = () => `e2e-dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text }).first();

test.describe("Free download", () => {
  test("guest: the button opens the sign-in invite; nothing downloads without an account", async ({ page }) => {
    await page.goto(`/vi/product/${FREE.slug}`);
    // The file location is never part of the page (CLAUDE.md §7).
    const html = await page.content();
    expect(html).not.toContain("/api/files/");
    expect(html).not.toContain("demo-readme");
    await expect(page.getByText("Cần đăng nhập để tải. Mỗi tài khoản được tải bộ này 2 lần.").filter({ visible: true })).toBeVisible();

    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await visible(page, "download-free").click();
    const invite = page.getByRole("dialog");
    await expect(invite).toBeVisible();
    await expect(invite.getByRole("heading", { name: vi.download.invite.title })).toBeVisible();
    await expect(invite.getByText(vi.download.invite.perks.library.title, { exact: true })).toBeVisible();
    await expect(invite.getByText("2 lượt tải miễn phí", { exact: true })).toBeVisible();
    await expect(invite.getByText(vi.download.invite.perks.updates.title, { exact: true })).toBeVisible();
    await expect(invite.getByTestId("invite-sign-in")).toHaveText(vi.download.invite.signIn);
    await expect(invite.getByTestId("invite-register")).toHaveText(vi.download.invite.register);
    await expect(invite.getByTestId("invite-skip")).toHaveCount(0); // no "download without saving" any more

    await page.keyboard.press("Escape");
    await expect(invite).toBeHidden();
    expect(downloaded).toBe(false);
  });

  test("sign up from the invite box → back on the pack, download starts; 2 downloads, then none left", async ({ page }) => {
    await page.goto(`/vi/product/${FREE.slug}`);
    await visible(page, "download-free").click();
    await page.getByRole("dialog").getByTestId("invite-register").click();
    await expect(page).toHaveURL(/\/vi\/register\?callbackUrl=/);

    const form = visible(page, "register-form");
    await form.getByLabel(vi.auth.name).fill("Lâm Phong");
    await form.getByLabel(vi.auth.email).fill(uniqueEmail());
    await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
    await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      form.getByRole("button", { name: vi.auth.register.submit }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${FREE.slug}-demo-readme.txt`);
    expect(await readFile((await download.path())!, "utf8")).toContain("DEMO");
    await expect(toast(page, vi.download.saved)).toContainText("Còn 1 lượt tải miễn phí cho bộ này.");
    await expect(page).toHaveURL(new RegExp(`/vi/product/${FREE.slug}$`)); // the one-shot flag is dropped
    await expect(visible(page, "in-library")).toContainText(vi.download.inLibrary);
    await expect(visible(page, "downloads-left")).toHaveText("Còn 1 / 2 lượt tải miễn phí");

    // Second (last) download: no second claim; then the pack page says there are none left.
    const [again] = await Promise.all([page.waitForEvent("download"), visible(page, "download-free").click()]);
    expect(again.suggestedFilename()).toBe(`${FREE.slug}-demo-readme.txt`);
    await expect(toast(page, vi.download.started)).toContainText("Bạn đã dùng hết lượt tải miễn phí của bộ này.");
    const exhausted = visible(page, "download-exhausted");
    await expect(exhausted).toContainText("Đã dùng hết 2 lượt tải miễn phí");
    await expect(exhausted.getByTestId("buy-downloads")).toBeEnabled();
    await expect(exhausted.getByTestId("buy-downloads")).toHaveText(/Mua thêm 2 lượt · 10\.000\s₫/);
    await expect(visible(page, "download-free")).toHaveCount(0);

    // The library keeps the pack and offers more downloads right on the row.
    await page.goto("/vi/library");
    const items = visible(page, "library-items").getByTestId("library-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(FREE.title);
    await expect(items.first()).toContainText(/Lưu ngày/); // acquired via a free claim
    await expect(visible(page, "library-downloads-left")).toHaveText("Đã dùng hết 2 lượt tải miễn phí");
    await expect(visible(page, "library-buy-nudge")).toHaveText(/Cần tải lại\? Thêm 2 lượt chỉ 10\.000\s₫\./);
    await expect(visible(page, "library-download")).toHaveCount(0);
    await expect(visible(page, "download-history").getByRole("listitem")).toHaveCount(2);

    // Buy 2 more: confirm box → demo gateway → paid → "Download now" downloads on the pack page.
    await visible(page, "buy-downloads").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Mua thêm 2 lượt tải" })).toBeVisible();
    await expect(dialog.getByTestId("buy-downloads-price")).toHaveText(/^10\.000\s₫$/);
    await expect(dialog).toContainText(vi.extraDownloads.dialog.perks.noExpiry);
    await expect(dialog).toContainText(vi.extraDownloads.dialog.demoNote);
    await dialog.getByTestId("buy-downloads-pay").click();
    await expect(page).toHaveURL(/\/vi\/checkout\/demo\/demo_/);
    await expect(visible(page, "demo-amount")).toHaveText(/^10\.000\s₫$/);
    await expect(visible(page, "demo-gateway")).toContainText("+2 lượt tải");
    await visible(page, "demo-succeed").click();
    const status = visible(page, "order-status");
    await expect(status).toHaveAttribute("data-status", "PAID");
    await expect(status).toContainText("Đã cộng 2 lượt tải");
    await expect(visible(page, "order-code")).toBeVisible();
    await expect(page.getByText(`${FREE.title} · +2 lượt tải`).filter({ visible: true })).toBeVisible();

    const [bought] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), visible(page, "download-now").click()]);
    expect(bought.suggestedFilename()).toBe(`${FREE.slug}-demo-readme.txt`);
    await expect(page).toHaveURL(new RegExp(`/vi/product/${FREE.slug}$`));
    await expect(visible(page, "downloads-left")).toHaveText("Còn 1 / 4 lượt tải miễn phí");

    // The order is in the history, labelled as downloads.
    await page.goto("/vi/orders");
    await expect(visible(page, "order-row").first()).toContainText("+2 lượt tải");
  });

  test("premium packs have no download button; file links cannot be forged or reused from public URLs", async ({ page, request }) => {
    await page.goto(`/vi/product/${PREMIUM}`);
    await expect(visible(page, "buy-now")).toBeVisible();
    await expect(visible(page, "download-free")).toHaveCount(0);
    expect(await page.content()).not.toContain("demo-readme");

    for (const bad of ["/api/files/x", "/api/files/abc.def", `/api/files/${"A".repeat(40)}.${"B".repeat(43)}`]) {
      const res = await request.get(bad);
      expect(res.status(), bad).toBe(404);
    }
    // A forged token for a premium file (unsigned payload) is refused.
    const payload = Buffer.from(JSON.stringify({ k: `products/${PREMIUM}/1.3.0/${PREMIUM}-demo-readme.txt`, f: "x.txt", e: 9_999_999_999 })).toString("base64url");
    expect((await request.get(`/api/files/${payload}.${"A".repeat(43)}`)).status()).toBe(404);
  });
});
