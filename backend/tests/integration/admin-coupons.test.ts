import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_EXTRA_DOWNLOADS } from "@backend/lib/download/rules";
import { addToCart } from "@backend/modules/cart/service";
import {
  createAdminCoupon,
  deleteAdminCoupon,
  getAdminCoupon,
  listAdminCoupons,
  updateAdminCoupon,
} from "@backend/modules/coupon/admin-service";
import { getCheckout, placeOrder } from "@backend/modules/order/service";
import { saveAdminSettings } from "@backend/modules/settings/admin-service";
import { getExtraDownloadsOffer } from "@backend/modules/settings/service";
import {
  cleanup,
  createPack,
  createUser,
  db,
  eventId,
  newTag,
  pinExtraDownloadsOffer,
  placeExtraDownloads,
  sendWebhook,
} from "./fixtures";

/**
 * Admin coupons + settings (GĐ5.6, DECISIONS #35) against the real services and the dev database: the per-account
 * limit counts paid and live pending orders, a used coupon keeps its code / kind / value and cannot be deleted,
 * the "more downloads" offer is read by new orders only — every change audited, impossible values refused by the
 * database too.
 */
const tag = newTag();
const CODE = (suffix: string) => `IT${tag.toUpperCase()}${suffix}`;
let admin: { id: string };
let restoreOffer: () => Promise<void>;

const audits = (entity: string, entityId: string, action: string) =>
  db().auditLog.count({ where: { entity, entityId, action } });
const couponCheck = async (userId: string, code: string) => (await getCheckout(userId, "vi", code))!.summary.coupon;
const form = (over: Record<string, string> = {}) => ({
  code: CODE("A"),
  kind: "PERCENT",
  value: "10",
  minTotalVnd: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerUser: "",
  isActive: "on",
  ...over,
});

/** Cart → checkout → PENDING order, like a customer (not paid yet). */
async function place(userId: string, productId: string, coupon: string | null) {
  const added = await addToCart({ kind: "user", userId }, productId);
  if (!added.ok && added.reason !== "alreadyInCart") throw new Error(`addToCart: ${added.reason}`);
  const checkout = await getCheckout(userId, "vi", coupon);
  const placed = await placeOrder({
    userId,
    locale: "vi",
    couponCode: coupon,
    expectedTotalVnd: checkout!.summary.totalVnd,
  });
  if (!placed.ok) throw new Error(`placeOrder: ${placed.reason}`);
  return db().order.findUniqueOrThrow({
    where: { code: placed.orderCode },
    select: { id: true, code: true, totalVnd: true, couponId: true, payments: { select: { providerTxnId: true } } },
  });
}

async function pay(order: { code: string; totalVnd: number; payments: { providerTxnId: string | null }[] }) {
  const r = await sendWebhook({
    eventId: eventId(tag),
    txnId: order.payments[0].providerTxnId!,
    orderCode: order.code,
    amountVnd: order.totalVnd,
    status: "SUCCEEDED",
  });
  expect(r.result).toBe("processed");
}

beforeAll(async () => {
  admin = await createUser(tag, "admin");
  await db().user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  restoreOffer = await pinExtraDownloadsOffer(DEFAULT_EXTRA_DOWNLOADS);
});

afterAll(async () => {
  await restoreOffer();
  await cleanup(tag); // orders (and their coupon redemptions) and the test Admin's AuditLog rows go first
  await db().coupon.deleteMany({ where: { code: { startsWith: CODE("") } } });
  expect(await db().coupon.count({ where: { code: { startsWith: CODE("") } } })).toBe(0);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Creating coupons", () => {
  it("normalises and audits a new code; refuses a taken code and bad values; the database refuses them too", async () => {
    const created = await createAdminCoupon(form({ code: ` ${CODE("A").toLowerCase()} ` }), admin.id);
    expect(created).toMatchObject({ ok: true });
    const id = created.ok ? created.id : "";
    expect((await db().coupon.findUniqueOrThrow({ where: { id } })).code).toBe(CODE("A"));
    expect(await audits("Coupon", id, "coupon.create")).toBe(1);

    expect(await createAdminCoupon(form(), admin.id)).toEqual({ ok: false, fields: { code: "codeTaken" } });
    expect(await createAdminCoupon(form({ code: CODE("B"), value: "0" }), admin.id)).toEqual({
      ok: false,
      fields: { value: "percentRange" },
    });
    expect(await db().coupon.count({ where: { code: { startsWith: CODE("") } } })).toBe(1);

    // Even past the app, the database refuses impossible coupons (migration admin_coupons_settings).
    await expect(db().coupon.create({ data: { code: CODE("X1"), kind: "PERCENT", value: 150 } })).rejects.toThrow();
    await expect(
      db().coupon.create({ data: { code: CODE("X2"), kind: "FIXED", value: 1000, maxUsesPerUser: 0 } }),
    ).rejects.toThrow();

    const listed = await listAdminCoupons({ q: CODE("") }, 1);
    expect(listed.items.map((c) => c.code)).toEqual([CODE("A")]);
    expect(listed.items[0]).toMatchObject({ state: "active", used: false });
  });
});

describe("Per-account limit (DECISIONS #35)", () => {
  it("a live pending order counts, an expired one does not, a paid one does; other accounts are not affected", async () => {
    const created = await createAdminCoupon(form({ code: CODE("ONE"), maxUsesPerUser: "1" }), admin.id);
    if (!created.ok) throw new Error("create");
    const [buyer, other] = await Promise.all([createUser(tag, "buyer"), createUser(tag, "other")]);
    const [p1, p2] = await Promise.all([
      createPack(tag, "p1", { type: "PREMIUM", priceVnd: 200_000 }),
      createPack(tag, "p2", { type: "PREMIUM", priceVnd: 300_000 }),
    ]);

    const first = await place(buyer.id, p1.id, CODE("ONE"));
    expect(first.couponId).toBe(created.id);
    expect(first.totalVnd).toBe(180_000);

    await addToCart({ kind: "user", userId: buyer.id }, p2.id);
    expect(await couponCheck(buyer.id, CODE("ONE"))).toMatchObject({ ok: false, problem: "perUserLimit" });
    await addToCart({ kind: "user", userId: other.id }, p2.id);
    expect(await couponCheck(other.id, CODE("ONE"))).toMatchObject({ ok: true });

    // The pending order expires → the code is free again for this account.
    await db().order.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await couponCheck(buyer.id, CODE("ONE"))).toMatchObject({ ok: true });

    // Paid → counted for good.
    await db().order.update({ where: { id: first.id }, data: { expiresAt: new Date(Date.now() + 15 * 60_000) } });
    await pay(first);
    expect(await db().couponRedemption.count({ where: { couponId: created.id, userId: buyer.id } })).toBe(1);
    expect(await couponCheck(buyer.id, CODE("ONE"))).toMatchObject({ ok: false, problem: "perUserLimit" });

    const view = await getAdminCoupon(created.id);
    expect(view).toMatchObject({ used: true, usedCount: 1, orderCount: 1, paidCount: 1 });
    expect(view!.orders.map((o) => [o.code, o.status, o.discountVnd])).toEqual([[first.code, "PAID", 20_000]]);
  });
});

describe("Editing and deleting (DECISIONS #35)", () => {
  it("a used coupon keeps code / kind / value and cannot be deleted; its dates, limits and on / off still change", async () => {
    const c = await db().coupon.findUniqueOrThrow({ where: { code: CODE("ONE") } });
    const base = form({ code: CODE("ONE"), maxUsesPerUser: "1" });

    expect(await updateAdminCoupon(c.id, { ...base, code: CODE("ONE2") }, admin.id)).toEqual({
      ok: false,
      fields: { code: "locked" },
    });
    expect(await updateAdminCoupon(c.id, { ...base, kind: "FIXED", value: "5000" }, admin.id)).toEqual({
      ok: false,
      fields: { kind: "locked", value: "locked" },
    });
    expect(
      await updateAdminCoupon(c.id, { ...base, maxUses: "50", endsAt: "2099-01-01T00:00", isActive: "" }, admin.id),
    ).toEqual({ ok: true, id: c.id, changed: true });
    const after = await db().coupon.findUniqueOrThrow({ where: { id: c.id } });
    expect(after).toMatchObject({ code: CODE("ONE"), value: 10, maxUses: 50, isActive: false });
    expect(after.endsAt?.toISOString()).toBe("2098-12-31T17:00:00.000Z"); // typed in shop time (UTC+7)
    expect(await audits("Coupon", c.id, "coupon.update")).toBe(1);

    expect(await deleteAdminCoupon(c.id, admin.id)).toEqual({ ok: false, error: "used" });
    expect(await db().coupon.count({ where: { id: c.id } })).toBe(1);
  });

  it("an unused coupon can change everything and be deleted; saving the same values writes nothing", async () => {
    const c = await db().coupon.findUniqueOrThrow({ where: { code: CODE("A") } });
    expect(await updateAdminCoupon(c.id, form(), admin.id)).toEqual({ ok: true, id: c.id, changed: false });
    expect(await audits("Coupon", c.id, "coupon.update")).toBe(0);

    expect(await updateAdminCoupon(c.id, form({ code: CODE("A2"), kind: "FIXED", value: "50.000" }), admin.id)).toEqual(
      { ok: true, id: c.id, changed: true },
    );
    expect(await db().coupon.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      code: CODE("A2"),
      kind: "FIXED",
      value: 50_000,
    });
    expect(await updateAdminCoupon(c.id, form({ code: CODE("ONE") }), admin.id)).toEqual({
      ok: false,
      fields: { code: "codeTaken" },
    });

    expect(await deleteAdminCoupon(c.id, admin.id)).toEqual({ ok: true });
    expect(await db().coupon.count({ where: { id: c.id } })).toBe(0);
    expect(await audits("Coupon", c.id, "coupon.delete")).toBe(1);
    expect(await deleteAdminCoupon(c.id, admin.id)).toEqual({ ok: false, error: "notFound" });
    expect(await getAdminCoupon("../etc")).toBeNull();
  });
});

describe("Settings: the more-downloads offer (DECISIONS #35)", () => {
  it("new orders use the saved offer, orders already placed keep theirs; audited; 0 ₫ refused", async () => {
    const customer = await createUser(tag, "extra");
    const free = await createPack(tag, "free", { type: "FREE" });
    const old = await placeExtraDownloads(customer.id, free.id);
    if (!old.ok) throw new Error(old.reason);
    expect(old.totalVnd).toBe(DEFAULT_EXTRA_DOWNLOADS.priceVnd);

    expect(await saveAdminSettings({ extraDownloadsCount: "3", extraDownloadsPriceVnd: "15.000" }, admin.id)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await getExtraDownloadsOffer()).toEqual({ count: 3, priceVnd: 15_000 });
    const log = await db().auditLog.findFirstOrThrow({
      where: { entity: "ShopSettings", action: "settings.update", adminId: admin.id },
    });
    expect(log.diff).toEqual({
      extraDownloads: { before: { count: 2, priceVnd: 10_000 }, after: { count: 3, priceVnd: 15_000 } },
    });

    // Another account: this one already has an order waiting for payment (one at a time, 2026-11-26).
    const fresh = await placeExtraDownloads((await createUser(tag, "extra2")).id, free.id);
    if (!fresh.ok) throw new Error(fresh.reason);
    expect(fresh.totalVnd).toBe(15_000);
    expect(fresh.items).toEqual([{ kind: "EXTRA_DOWNLOADS", extraDownloads: 3 }]);

    // The order placed before the change is paid at its own price and adds its own count.
    await pay({ code: old.code, totalVnd: old.totalVnd, payments: [{ providerTxnId: old.txnId }] });
    expect(
      (
        await db().downloadCredit.findUniqueOrThrow({
          where: { userId_productId: { userId: customer.id, productId: free.id } },
        })
      ).extraDownloads,
    ).toBe(2);

    expect(await saveAdminSettings({ extraDownloadsCount: "3", extraDownloadsPriceVnd: "15000" }, admin.id)).toEqual({
      ok: true,
      changed: false,
    });
    expect(await saveAdminSettings({ extraDownloadsCount: "3", extraDownloadsPriceVnd: "0" }, admin.id)).toEqual({
      ok: false,
      fields: { extraDownloadsPriceVnd: "outOfRange" },
    });
    expect(await getExtraDownloadsOffer()).toEqual({ count: 3, priceVnd: 15_000 });
    expect(await db().auditLog.count({ where: { entity: "ShopSettings", adminId: admin.id } })).toBe(1);
    await expect(db().shopSettings.update({ where: { id: 1 }, data: { extraDownloadsPriceVnd: 0 } })).rejects.toThrow();
  });
});
