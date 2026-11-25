import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };
import { DEMO_SIGNATURE_HEADER, signDemoWebhook } from "@backend/modules/payment/providers/demo-signature";

/**
 * Phase 4.2 — checkout + Demo payment (CLAUDE.md §6, §7): the order is recomputed on the server, the demo
 * banner is always visible, only a verified webhook grants packs, a replayed webhook grants nothing twice and
 * a wrong amount is refused. The tests sign webhooks with the same AUTH_SECRET as the server (.env.local).
 */
loadEnvConfig(process.cwd());
const SECRET = process.env.AUTH_SECRET;

const A = { slug: "tien-hiep-dao-mon", title: "Tiên Hiệp Đạo Môn", total: /1\.490\.000/ };
const B = { slug: "kiem-hiep-giang-ho", title: "Kiếm Hiệp Giang Hồ" };
const PASSWORD = "matkhau-e2e-123";
const uniqueEmail = () => `e2e-pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text }).first();

async function register(page: Page) {
  await page.goto("/vi/register");
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Lâm Phong");
  await form.getByLabel(vi.auth.email).fill(uniqueEmail());
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByLabel(vi.auth.confirmPassword).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.register.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

/** Buy now on a pack → the cart (coupon box) → checkout → place order → the Demo gateway. */
async function orderAndOpenGateway(page: Page, slug: string) {
  await page.goto(`/vi/product/${slug}`);
  await visible(page, "buy-now").click();
  await expect(page).toHaveURL(/\/vi\/cart$/); // user request 2026-11-19: a coupon can be applied first
  await expect(visible(page, "coupon-form")).toBeVisible();
  await visible(page, "checkout").click();
  await expect(page).toHaveURL(/\/vi\/checkout$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.checkout);
  await expect(visible(page, "demo-banner")).toContainText(vi.checkout.demoBanner);
  await visible(page, "place-order").click();
  await expect(page).toHaveURL(/\/vi\/checkout\/demo\/demo_[A-Za-z0-9_-]+$/);
  await expect(visible(page, "demo-banner")).toBeVisible();
  const txnId = page.url().split("/").pop()!;
  const orderCode = (await visible(page, "demo-order-code").textContent())!.trim();
  return { txnId, orderCode };
}

function signedWebhook(request: APIRequestContext, body: Record<string, unknown>, opts: { signature?: string } = {}) {
  const raw = JSON.stringify(body);
  return request.post("/api/payments/demo/webhook", {
    data: raw,
    headers: { "content-type": "application/json", [DEMO_SIGNATURE_HEADER]: opts.signature ?? signDemoWebhook(raw, SECRET) },
  });
}
const eventId = () => `evt_${randomBytes(12).toString("base64url")}`;

test.describe("An order waiting for payment (user choice 2026-11-26)", () => {
  test("checkout asks to pay or cancel it; cancelling brings the button back; the order shows as cancelled", async ({ page }) => {
    await register(page);
    const first = await orderAndOpenGateway(page, B.slug); // not paid: the order waits

    await page.goto("/vi/checkout");
    const open = visible(page, "open-order");
    await expect(open).toHaveAttribute("data-code", first.orderCode);
    await expect(open).toContainText(vi.checkout.openOrder.title);
    await expect(visible(page, "place-order")).toHaveCount(0);

    // "Pay that order" → its page, still waiting, with its own cancel button.
    await open.getByTestId("open-order-pay").click();
    await expect(page).toHaveURL(new RegExp(`/vi/checkout/result/${first.orderCode}$`));
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PENDING");
    await expect(visible(page, "cancel-order")).toBeVisible();

    // Back to checkout: cancel it, the place-order button comes back.
    await page.goto("/vi/checkout");
    await visible(page, "open-order").getByTestId("cancel-order").click();
    await expect(toast(page, vi.checkout.cancel.done)).toBeVisible();
    await expect(visible(page, "open-order")).toHaveCount(0);
    await expect(visible(page, "place-order")).toBeVisible();

    await page.goto(`/vi/checkout/result/${first.orderCode}`);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "CANCELLED");
    await expect(visible(page, "order-status")).toContainText(vi.checkout.result.cancelledTitle);
    await expect(visible(page, "cancel-order")).toHaveCount(0);

    // A new order goes through.
    await page.goto("/vi/checkout");
    await visible(page, "place-order").click();
    await expect(page).toHaveURL(/\/vi\/checkout\/demo\/demo_[A-Za-z0-9_-]+$/);
    expect((await visible(page, "demo-order-code").textContent())!.trim()).not.toBe(first.orderCode);
  });
});

test.describe("Checkout + Demo payment", () => {
  test("buy now → cart → checkout → demo success → pack in the library, downloadable, cart emptied, shown as owned", async ({ page }) => {
    await register(page);
    await orderAndOpenGateway(page, A.slug);
    await expect(visible(page, "demo-amount")).toHaveText(A.total);

    await visible(page, "demo-succeed").click();
    await expect(page).toHaveURL(/\/vi\/checkout\/result\/AG-\d{8}-[A-Z0-9]{6}$/);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");
    await expect(page.getByText(vi.checkout.result.paidTitle).filter({ visible: true })).toBeVisible();
    await expect(visible(page, "order-total")).toHaveText(A.total);
    await expect(visible(page, "cart-count")).toHaveCount(0); // the paid pack left the cart; the badge follows

    await visible(page, "open-library").click();
    const items = visible(page, "library-items").getByTestId("library-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(A.title);
    await expect(items.first()).toContainText(vi.library.source.PURCHASE);
    const [download] = await Promise.all([page.waitForEvent("download"), visible(page, "library-download").click()]);
    expect(download.suggestedFilename()).toBe(`${A.slug}-demo-readme.txt`);

    await page.goto("/vi/cart");
    await expect(page.getByText(vi.cart.emptyTitle).filter({ visible: true })).toBeVisible();
    // The pack page now says it is owned: no buy buttons, a download instead.
    await page.goto(`/vi/product/${A.slug}`);
    await expect(visible(page, "owned-pack")).toContainText(vi.productPage.owned);
    await expect(visible(page, "buy-now")).toHaveCount(0);
    await expect(visible(page, "add-to-cart")).toHaveCount(0);
  });

  test("failed payment grants nothing and keeps the cart; the coupon discount is carried into the order", async ({ page }) => {
    await register(page);
    await page.goto(`/vi/product/${B.slug}`);
    await visible(page, "add-to-cart").click();
    await expect(toast(page, vi.cart.added)).toBeVisible();
    await page.goto("/vi/cart");
    const coupon = visible(page, "coupon-form");
    await coupon.getByRole("textbox").fill("demo10");
    await coupon.getByRole("button", { name: vi.cart.coupon.apply }).click();
    await expect(visible(page, "coupon-applied")).toContainText("DEMO10");

    await visible(page, "checkout").click();
    await expect(page).toHaveURL(/\/vi\/checkout$/);
    await expect(visible(page, "checkout-discount")).toBeVisible();
    await expect(visible(page, "checkout-total")).toHaveText(/1\.161\.000/); // 1.290.000 − 10%
    await visible(page, "place-order").click();
    await expect(page).toHaveURL(/\/checkout\/demo\//);
    await expect(visible(page, "demo-amount")).toHaveText(/1\.161\.000/);

    await visible(page, "demo-fail").click();
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "FAILED");
    await page.goto("/vi/library");
    await expect(page.getByText(vi.library.emptyTitle).filter({ visible: true })).toBeVisible();
    await page.goto("/vi/cart");
    await expect(visible(page, "cart-lines").getByTestId("cart-line")).toHaveCount(1);
    // The coupon went with the order (it never follows into the next cart); to try again, enter it again.
    await expect(visible(page, "coupon-applied")).toHaveCount(0);
    await expect(visible(page, "coupon-form")).toBeVisible();
  });

  test("webhook security: bad signature, wrong amount, unknown payment, replay and late events change nothing", async ({ page, request }) => {
    test.skip(!SECRET, "AUTH_SECRET is needed to sign test webhooks");
    // No / forged signature, other providers.
    expect((await request.post("/api/payments/demo/webhook", { data: "{}" })).status()).toBe(401);
    expect((await signedWebhook(request, { eventId: eventId() }, { signature: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` })).status()).toBe(401);
    expect((await request.post("/api/payments/payos/webhook", { data: "{}" })).status()).toBe(404);
    expect((await signedWebhook(request, { eventId: eventId(), txnId: `demo_${"x".repeat(24)}`, orderCode: "AG-20261114-AAAAAA", amountVnd: 1, status: "SUCCEEDED" })).status()).toBe(404);

    await register(page);
    const { txnId, orderCode } = await orderAndOpenGateway(page, A.slug);
    const event = { txnId, orderCode, amountVnd: 1_490_000, status: "SUCCEEDED" };

    // Paying less (or naming another order) is refused and the order stays pending.
    expect((await signedWebhook(request, { ...event, eventId: eventId(), amountVnd: 1_000 })).status()).toBe(400);
    expect((await signedWebhook(request, { ...event, eventId: eventId(), orderCode: "AG-20261114-AAAAAA" })).status()).toBe(400);
    await page.goto(`/vi/checkout/result/${orderCode}`);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PENDING");
    await page.goto("/vi/library");
    await expect(page.getByText(vi.library.emptyTitle).filter({ visible: true })).toBeVisible();

    // The real event settles it once; a replay and a later event are acknowledged but change nothing.
    const first = { ...event, eventId: eventId() };
    const ok = await signedWebhook(request, first);
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ status: "processed" });
    expect(await (await signedWebhook(request, first)).json()).toEqual({ status: "duplicate" });
    expect(await (await signedWebhook(request, { ...event, eventId: eventId(), status: "FAILED" })).json()).toEqual({ status: "ignored" });

    await page.goto(`/vi/checkout/result/${orderCode}`);
    await expect(visible(page, "order-status")).toHaveAttribute("data-status", "PAID");
    await page.goto("/vi/library");
    await expect(visible(page, "library-items").getByTestId("library-item")).toHaveCount(1);
    // The gateway page of a settled payment just shows the result.
    await page.goto(`/vi/checkout/demo/${txnId}`);
    await expect(page).toHaveURL(new RegExp(`/vi/checkout/result/${orderCode}$`));
  });

  test("checkout needs an account; other users' orders and gateways are not visible", async ({ page, browser }) => {
    await page.goto("/vi/checkout");
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Fcheckout$/);

    await register(page);
    const { txnId, orderCode } = await orderAndOpenGateway(page, B.slug);

    const other = await browser.newPage();
    await register(other);
    await other.goto(`/vi/checkout/result/${orderCode}`);
    await expect(other.getByText(vi.checkout.result.notFoundTitle).filter({ visible: true })).toBeVisible();
    await other.goto(`/vi/checkout/demo/${txnId}`);
    await expect(other.getByText(vi.checkout.demo.notFoundTitle).filter({ visible: true })).toBeVisible();
    await other.close();
  });
});
