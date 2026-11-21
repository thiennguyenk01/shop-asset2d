import { expect, test, type Page } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * Phase 3.3 — cart (CLAUDE.md §5): no quantities, Premium only, guest cart merged into the account cart on
 * sign-in, totals recomputed from current prices. "Owned" lines need purchases (Phase 4) — covered by unit tests.
 * Elements are located with `visible: true` (Next keeps recently visited pages mounted but hidden).
 */
const A = { slug: "tien-hiep-dao-mon", title: "Tiên Hiệp Đạo Môn", price: /1\.490\.000/ };
const B = { slug: "kiem-hiep-giang-ho", title: "Kiếm Hiệp Giang Hồ", price: /1\.290\.000/ };
const FREE = "khoi-dau-tien-hiep";
const PASSWORD = "matkhau-e2e-123";
const uniqueEmail = () => `e2e-cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function addFromPack(page: Page, slug: string, expectToast: string = vi.cart.added) {
  await page.goto(`/vi/product/${slug}`);
  await visible(page, "add-to-cart").click();
  await expect(page.getByTestId("toast").filter({ hasText: expectToast }).first()).toBeVisible();
}

const lines = (page: Page) => visible(page, "cart-lines").getByTestId("cart-line");

async function register(page: Page, email: string) {
  const form = visible(page, "register-form");
  await form.getByLabel(vi.auth.name).fill("Lâm Phong");
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

async function login(page: Page, email: string) {
  await page.goto("/vi/login");
  const form = visible(page, "login-form");
  await form.getByLabel(vi.auth.email).fill(email);
  await form.getByLabel(vi.auth.password, { exact: true }).fill(PASSWORD);
  await form.getByRole("button", { name: vi.auth.login.submit }).click();
  await expect(visible(page, "account-menu")).toBeVisible();
}

test.describe("Cart", () => {
  test("guest: add, no duplicates, badge, totals from current prices, remove → empty", async ({ page }) => {
    await page.goto("/vi/cart");
    await expect(page.getByText(vi.cart.emptyTitle).filter({ visible: true })).toBeVisible();

    await addFromPack(page, A.slug);
    await expect(visible(page, "cart-count").first()).toContainText("1");
    await visible(page, "add-to-cart").click(); // same pack again
    await expect(page.getByTestId("toast").filter({ hasText: vi.cart.blocked.alreadyInCart }).first()).toBeVisible();
    await addFromPack(page, B.slug);
    await expect(visible(page, "cart-count").first()).toContainText("2");

    await page.goto("/vi/cart");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.nav.cart);
    await expect(lines(page)).toHaveCount(2);
    await expect(visible(page, "cart-total")).toHaveText(/2\.780\.000/); // 1.490.000 + 1.290.000
    await expect(visible(page, "cart-summary")).toContainText(vi.cart.savings); // pack A is on sale
    await expect(page.getByText(vi.cart.benefitsTitle).filter({ visible: true })).toBeVisible(); // terms shown before buying (§11)

    await lines(page).filter({ hasText: A.title }).getByTestId("cart-remove").click();
    await expect(lines(page)).toHaveCount(1);
    await expect(visible(page, "cart-total")).toHaveText(B.price);
    await lines(page).getByTestId("cart-remove").click();
    await expect(page.getByText(vi.cart.emptyTitle).filter({ visible: true })).toBeVisible();
    await expect(visible(page, "cart-count")).toHaveCount(0);
  });

  test("buy now adds the pack and opens the cart (coupon first; guests sign in at Checkout); free packs have no cart buttons", async ({ page }) => {
    await page.goto(`/vi/product/${A.slug}`);
    await visible(page, "buy-now").click();
    await expect(page).toHaveURL(/\/vi\/cart$/); // user request 2026-11-19: apply a coupon before paying
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page)).toContainText(A.title);
    await expect(visible(page, "coupon-form")).toBeVisible();
    // Buy now again on the same pack: no second line, just the cart.
    await page.goto(`/vi/product/${A.slug}`);
    await visible(page, "buy-now").click();
    await expect(page).toHaveURL(/\/vi\/cart$/);
    await expect(lines(page)).toHaveCount(1);
    // Paying needs an account (§5): Checkout sends a guest to sign in.
    await visible(page, "checkout").click();
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Fcart$/);

    await page.goto(`/vi/product/${FREE}`);
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);
    await expect(page.getByTestId("buy-now")).toHaveCount(0);
  });

  test("guest checkout asks to sign in; signing up keeps the cart (merge)", async ({ page }) => {
    await addFromPack(page, A.slug);
    await page.goto("/vi/cart");
    await visible(page, "checkout").click();
    await expect(page).toHaveURL(/\/vi\/login\?callbackUrl=%2Fcart$/);
    await page.getByRole("link", { name: vi.auth.login.registerLink }).click();
    await expect(page).toHaveURL(/\/vi\/register\?callbackUrl=%2Fcart$/);
    await register(page, uniqueEmail());

    await expect(page).toHaveURL(/\/vi\/cart$/);
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page)).toContainText(A.title);
    await expect(visible(page, "checkout")).toHaveText(vi.cart.checkout); // signed in: real checkout button
  });

  test("signing in merges the guest cart into the account cart without duplicates; sign-out hides it", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/vi/register");
    await register(page, email);
    await addFromPack(page, A.slug); // account cart: A
    await signOut(page);

    await page.goto("/vi/cart");
    await expect(page.getByText(vi.cart.emptyTitle).filter({ visible: true })).toBeVisible(); // the account cart is not visible to guests

    await addFromPack(page, A.slug); // guest cart: A + B
    await addFromPack(page, B.slug);
    await login(page, email);

    await page.goto("/vi/cart");
    await expect(lines(page)).toHaveCount(2); // A once, B moved over
    await expect(visible(page, "cart-total")).toHaveText(/2\.780\.000/);
  });

  test("coupons: apply DEMO10, refuse bad / expired / used-up codes, remove", async ({ page }) => {
    await addFromPack(page, A.slug); // 1.490.000 ₫
    await page.goto("/vi/cart");
    const box = visible(page, "coupon-form");
    const apply = async (code: string) => {
      await visible(page, "coupon-form").getByLabel(vi.cart.coupon.label).fill(code);
      await visible(page, "coupon-form").getByRole("button", { name: vi.cart.coupon.apply }).click();
    };

    await apply("x");
    await expect(box.getByRole("alert")).toHaveText(vi.cart.coupon.problems.format);
    await apply("KHONGCOMA");
    await expect(box.getByRole("alert")).toHaveText(vi.cart.coupon.problems.invalid);
    await apply("demohethan"); // case-insensitive
    await expect(box.getByRole("alert")).toHaveText(vi.cart.coupon.problems.expired);
    await apply("DEMOHETLUOT");
    await expect(box.getByRole("alert")).toHaveText(vi.cart.coupon.problems.usedUp);

    await apply(" demo10 ");
    await expect(page.getByTestId("toast").filter({ hasText: "DEMO10" }).first()).toBeVisible();
    await expect(visible(page, "coupon-applied")).toContainText("DEMO10");
    await expect(visible(page, "cart-discount")).toContainText("149.000");
    await expect(visible(page, "cart-total")).toHaveText(/1\.341\.000/); // 1.490.000 − 10%

    await page.reload(); // remembered, and re-checked on the server
    await expect(visible(page, "cart-total")).toHaveText(/1\.341\.000/);

    await visible(page, "coupon-remove").click();
    await expect(visible(page, "coupon-form")).toBeVisible();
    await expect(visible(page, "cart-total")).toHaveText(A.price);
  });

  test("coupons: after 10 codes that could not be used, trying is paused for a while (even a valid code)", async ({ page }) => {
    await addFromPack(page, A.slug);
    await page.goto("/vi/cart");
    const box = visible(page, "coupon-form");
    // The alert text repeats between tries: wait for each server answer so every try is counted once.
    const apply = async (code: string) => {
      await visible(page, "coupon-form").getByLabel(vi.cart.coupon.label).fill(code);
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/cart")),
        visible(page, "coupon-form").getByRole("button", { name: vi.cart.coupon.apply }).click(),
      ]);
    };
    for (let i = 0; i < 10; i++) {
      await apply(`KHONGCO${i}`);
      await expect(box.getByRole("alert")).toHaveText(vi.cart.coupon.problems.invalid);
    }
    const [before, after] = vi.cart.coupon.problems.tooManyAttempts.split("{minutes}");
    const wait = new RegExp(`^${before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+${after.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    await apply("KHONGCO10");
    await expect(box.getByRole("alert")).toHaveText(wait);
    await apply("DEMO10"); // a valid code waits too
    await expect(box.getByRole("alert")).toHaveText(wait);
    await expect(visible(page, "coupon-applied")).toHaveCount(0);
  });

  test("coupons: minimum order total, and a coupon that stops counting when the cart changes", async ({ page }) => {
    await addFromPack(page, "tien-mon-chibi"); // 690.000 ₫
    await page.goto("/vi/cart");
    const form = visible(page, "coupon-form");
    await form.getByLabel(vi.cart.coupon.label).fill("DEMO200K");
    await form.getByRole("button", { name: vi.cart.coupon.apply }).click();
    await expect(form.getByRole("alert")).toContainText("1.000.000"); // needs 1.000.000 ₫

    await addFromPack(page, A.slug); // now 2.180.000 ₫
    await page.goto("/vi/cart");
    await visible(page, "coupon-form").getByLabel(vi.cart.coupon.label).fill("DEMO200K");
    await visible(page, "coupon-form").getByRole("button", { name: vi.cart.coupon.apply }).click();
    await expect(visible(page, "cart-total")).toHaveText(/1\.980\.000/); // −200.000

    // Remove the big pack: the cart drops under the minimum → the code stays but gives nothing, and says why.
    await lines(page).filter({ hasText: A.title }).getByTestId("cart-remove").click();
    await expect(visible(page, "coupon-warning")).toContainText("1.000.000");
    await expect(visible(page, "cart-discount")).toHaveCount(0);
    await expect(visible(page, "cart-total")).toHaveText(/690\.000/);
  });
});
