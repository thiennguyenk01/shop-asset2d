import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addToCart } from "@backend/modules/cart/service";
import { insertOrder, type NewOrder } from "@backend/modules/order/repository";
import { cancelOrder, getCheckout, placeOrder } from "@backend/modules/order/service";
import { cleanup, createPack, createUser, db, eventId, newTag, placeExtraDownloads, placePendingOrder, sendWebhook } from "./fixtures";

/**
 * One order waiting for payment per account, and coupon uses held by those orders (user choice 2026-11-26), against
 * the real services and the dev database: a second order is refused until the first is paid, expires or is cancelled
 * by its owner; a late payment for a cancelled order grants nothing; a coupon's last use cannot be taken twice, even
 * by two orders placed at the same moment.
 */
const tag = newTag();
const CODE = (suffix: string) => `IT${tag.toUpperCase()}${suffix}`;
const PRICE = 100_000;
let pack: { id: string };

const statusOf = async (orderId: string) => {
  const o = await db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, payments: { select: { status: true } } } });
  return [o.status, o.payments[0]?.status];
};

/** Cart → checkout → place, like a customer; returns the raw result (ok or the reason). */
async function tryPlace(userId: string, coupon: string | null) {
  await addToCart({ kind: "user", userId }, pack.id);
  const checkout = await getCheckout(userId, "vi", coupon);
  return placeOrder({ userId, locale: "vi", couponCode: coupon, expectedTotalVnd: checkout!.summary.totalVnd });
}

/** A bare order for the repository's insert (no gateway): what placeOrder would write. */
async function bareOrder(userId: string, couponId: string | null, code: string): Promise<NewOrder> {
  const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
  return {
    code,
    userId,
    subtotalVnd: PRICE,
    discountVnd: couponId ? 10_000 : 0,
    totalVnd: couponId ? PRICE - 10_000 : PRICE,
    couponId,
    buyerName: "IT",
    buyerEmail: "it@example.test",
    locale: "vi",
    isDemo: true,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    items: [{ productId: pack.id, productType: "PREMIUM", titleSnapshot: "IT", priceSnapshotVnd: PRICE, licenseId: license.id, licenseSnapshot: { code: "PREMIUM" }, versionId: null }],
  };
}

beforeAll(async () => {
  pack = await createPack(tag, "open", { type: "PREMIUM", priceVnd: PRICE });
});

afterAll(async () => {
  await cleanup(tag);
  await db().coupon.deleteMany({ where: { code: { startsWith: CODE("") } } });
  expect(await db().coupon.count({ where: { code: { startsWith: CODE("") } } })).toBe(0);
});

describe("one order waiting for payment per account", () => {
  it("a second order is refused (cart and more downloads) and checkout names the open one", async () => {
    const buyer = await createUser(tag, "one");
    const first = await placePendingOrder(buyer.id, pack.id, PRICE);

    expect(await tryPlace(buyer.id, null)).toEqual({ ok: false, reason: "pendingOrder", orderCode: first.code });
    expect((await getCheckout(buyer.id, "vi", null))!.openOrder).toMatchObject({ code: first.code, totalVnd: PRICE, cancellable: true });
    const free = await createPack(tag, "free", { type: "FREE" });
    expect(await placeExtraDownloads(buyer.id, free.id)).toEqual({ ok: false, reason: "pendingOrder", orderCode: first.code });
    expect(await db().order.count({ where: { userId: buyer.id } })).toBe(1);

    // Expired → no longer open: a new order goes through.
    await db().order.update({ where: { id: first.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await getCheckout(buyer.id, "vi", null))!.openOrder).toBeNull();
    expect((await tryPlace(buyer.id, null)).ok).toBe(true);
  });

  it("the owner cancels it: order and payment CANCELLED, a late paid event grants nothing, a new order is allowed", async () => {
    const [buyer, stranger] = await Promise.all([createUser(tag, "cancel"), createUser(tag, "stranger")]);
    const order = await placePendingOrder(buyer.id, pack.id, PRICE);

    expect(await cancelOrder(stranger.id, order.code)).toEqual({ ok: false, reason: "notFound" });
    expect(await statusOf(order.orderId)).toEqual(["PENDING", "PENDING"]);

    expect(await cancelOrder(buyer.id, order.code)).toEqual({ ok: true });
    expect(await statusOf(order.orderId)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(await cancelOrder(buyer.id, order.code)).toEqual({ ok: false, reason: "notOpen" });

    const late = await sendWebhook({ eventId: eventId(tag), txnId: order.txnId, orderCode: order.code, amountVnd: PRICE, status: "SUCCEEDED" });
    expect(late).toEqual({ status: 200, result: "ignored" });
    expect(await db().entitlement.count({ where: { userId: buyer.id } })).toBe(0);
    expect(await statusOf(order.orderId)).toEqual(["CANCELLED", "CANCELLED"]);

    expect((await tryPlace(buyer.id, null)).ok).toBe(true);
  });

  it("a paid order cannot be cancelled; an expired one cannot either (a late bank transfer may still pay it)", async () => {
    const buyer = await createUser(tag, "paid");
    const order = await placePendingOrder(buyer.id, pack.id, PRICE);
    await sendWebhook({ eventId: eventId(tag), txnId: order.txnId, orderCode: order.code, amountVnd: PRICE, status: "SUCCEEDED" });
    expect(await cancelOrder(buyer.id, order.code)).toEqual({ ok: false, reason: "notOpen" });
    expect(await statusOf(order.orderId)).toEqual(["PAID", "SUCCEEDED"]);

    const other = await createUser(tag, "expired");
    const old = await placePendingOrder(other.id, pack.id, PRICE);
    await db().order.update({ where: { id: old.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await cancelOrder(other.id, old.code)).toEqual({ ok: false, reason: "notOpen" });
    expect(await statusOf(old.orderId)).toEqual(["PENDING", "PENDING"]);
  });

  it("two orders of one account placed at the same moment: only one is created", async () => {
    const buyer = await createUser(tag, "twin");
    const results = await Promise.all([
      insertOrder(await bareOrder(buyer.id, null, `IT-${tag}-T1`), new Date()),
      insertOrder(await bareOrder(buyer.id, null, `IT-${tag}-T2`), new Date()),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: "pendingOrder" });
    expect(await db().order.count({ where: { userId: buyer.id } })).toBe(1);
  });
});

describe("coupon uses held by orders waiting for payment", () => {
  it("the last use is held by an open order: others see it used up until that order expires", async () => {
    const coupon = await db().coupon.create({ data: { code: CODE("LAST"), kind: "FIXED", value: 10_000, maxUses: 1 } });
    const [a, b] = await Promise.all([createUser(tag, "ca"), createUser(tag, "cb")]);

    const placed = await tryPlace(a.id, coupon.code);
    if (!placed.ok) throw new Error(placed.reason);
    await addToCart({ kind: "user", userId: b.id }, pack.id);
    expect((await getCheckout(b.id, "vi", coupon.code))!.summary.coupon).toMatchObject({ ok: false, problem: "usedUp" });

    const held = await db().order.findUniqueOrThrow({ where: { code: placed.orderCode }, select: { id: true } });
    await db().order.update({ where: { id: held.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await getCheckout(b.id, "vi", coupon.code))!.summary.coupon).toMatchObject({ ok: true });
  });

  it("two accounts take the last use at the same moment: one order, the other is refused", async () => {
    const coupon = await db().coupon.create({ data: { code: CODE("RACE"), kind: "FIXED", value: 10_000, maxUses: 1 } });
    const [a, b] = await Promise.all([createUser(tag, "ra"), createUser(tag, "rb")]);
    const results = await Promise.all([
      insertOrder(await bareOrder(a.id, coupon.id, `IT-${tag}-R1`), new Date()),
      insertOrder(await bareOrder(b.id, coupon.id, `IT-${tag}-R2`), new Date()),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "couponUsedUp" });
    expect(await db().order.count({ where: { couponId: coupon.id } })).toBe(1);
  });

  it("the per-account limit holds under the lock too", async () => {
    const coupon = await db().coupon.create({ data: { code: CODE("USER"), kind: "FIXED", value: 10_000, maxUsesPerUser: 1 } });
    const buyer = await createUser(tag, "pu");
    const first = await insertOrder(await bareOrder(buyer.id, coupon.id, `IT-${tag}-U1`), new Date());
    if (!first.ok) throw new Error(first.reason);
    // Paid use recorded, order closed: the account has used its one use.
    await db().order.update({ where: { id: first.id }, data: { status: "PAID" } });
    await db().couponRedemption.create({ data: { couponId: coupon.id, orderId: first.id, userId: buyer.id } });
    expect(await insertOrder(await bareOrder(buyer.id, coupon.id, `IT-${tag}-U2`), new Date())).toEqual({ ok: false, reason: "couponUsedUp" });
  });
});
