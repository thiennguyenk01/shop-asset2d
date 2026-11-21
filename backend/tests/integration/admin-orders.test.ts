import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFreeDownloadQuota, requestDownload } from "@backend/modules/download/service";
import { addToCart } from "@backend/modules/cart/service";
import { getAdminOrder, listAdminOrders, refundAdminOrder } from "@backend/modules/order/admin-service";
import { getCheckout, placeOrder } from "@backend/modules/order/service";
import {
  cleanup,
  createPack,
  createUser,
  db,
  eventId,
  newTag,
  placeExtraDownloads,
  placePendingOrder,
  sendWebhook,
} from "./fixtures";

/**
 * Admin orders + refunds (GĐ5.4, DECISIONS #33) against the real services and the dev database: a refund covers
 * the whole PAID order, revokes only the access that order granted, takes bought downloads back (never below 0),
 * counts the sales back, keeps the coupon use, writes one Refund + one AuditLog — and happens once, even when two
 * Admins click at the same moment.
 */
const tag = newTag();
const COUPON = `IT${tag.toUpperCase()}`;
const COUPON_FULL = `IT${tag.toUpperCase()}Z`;

let admin: { id: string };
let admin2: { id: string };
let p1: Awaited<ReturnType<typeof createPack>>;
let p2: Awaited<ReturnType<typeof createPack>>;
let free: Awaited<ReturnType<typeof createPack>>;

const download = (userId: string, productId: string) => requestDownload({ productId, userId, userAgent: "vitest" });
const sales = async (productId: string) =>
  (await db().product.findUniqueOrThrow({ where: { id: productId } })).salesCount;
const entitlement = (userId: string, productId: string) =>
  db().entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
const refundRows = (code: string) => db().refund.findMany({ where: { order: { code } } });

/** Cart → checkout → order → verified paid webhook, exactly like a customer. */
async function buy(userId: string, productIds: string[], coupon: string | null = null) {
  for (const id of productIds) {
    const added = await addToCart({ kind: "user", userId }, id);
    if (!added.ok) throw new Error(`addToCart: ${added.reason}`);
  }
  const checkout = await getCheckout(userId, "vi", coupon);
  const placed = await placeOrder({
    userId,
    locale: "vi",
    couponCode: coupon,
    expectedTotalVnd: checkout!.summary.totalVnd,
  });
  if (!placed.ok) throw new Error(`placeOrder: ${placed.reason}`);
  const order = await db().order.findUniqueOrThrow({
    where: { code: placed.orderCode },
    select: { id: true, code: true, totalVnd: true, payments: { select: { providerTxnId: true } } },
  });
  const paid = await sendWebhook({
    eventId: eventId(tag),
    txnId: order.payments[0].providerTxnId!,
    orderCode: order.code,
    amountVnd: order.totalVnd,
    status: "SUCCEEDED",
  });
  expect(paid.result).toBe("processed");
  return order;
}

async function buyExtraDownloads(userId: string, productId: string) {
  const order = await placeExtraDownloads(userId, productId);
  if (!order.ok) throw new Error(order.reason);
  await sendWebhook({
    eventId: eventId(tag),
    txnId: order.txnId,
    orderCode: order.code,
    amountVnd: order.totalVnd,
    status: "SUCCEEDED",
  });
  return order;
}

beforeAll(async () => {
  [admin, admin2] = await Promise.all([createUser(tag, "admin"), createUser(tag, "admin2")]);
  [p1, p2, free] = await Promise.all([
    createPack(tag, "p1", { type: "PREMIUM", priceVnd: 150_000 }),
    createPack(tag, "p2", { type: "PREMIUM", priceVnd: 200_000 }),
    createPack(tag, "free", { type: "FREE" }),
  ]);
  await db().coupon.createMany({
    data: [
      { code: COUPON, kind: "PERCENT", value: 10 },
      { code: COUPON_FULL, kind: "PERCENT", value: 100 },
    ],
  });
});

afterAll(async () => {
  await cleanup(tag); // orders (and their coupon redemptions) go first
  await db().coupon.deleteMany({ where: { code: { in: [COUPON, COUPON_FULL] } } });
  expect(await db().product.count({ where: { slug: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().coupon.count({ where: { code: { in: [COUPON, COUPON_FULL] } } })).toBe(0);
});

describe("Refusals change nothing", () => {
  it("a missing or too long reason, an unknown code and an unpaid order are refused", async () => {
    const customer = await createUser(tag, "unpaid");
    const pending = await placePendingOrder(customer.id, p1.id, 150_000);

    expect(await refundAdminOrder(pending.code, "", admin.id)).toEqual({ ok: false, error: "reasonRequired" });
    expect(await refundAdminOrder(pending.code, "x".repeat(501), admin.id)).toEqual({
      ok: false,
      error: "reasonTooLong",
    });
    expect(await refundAdminOrder("AG-20260101-AAAAAA", "lý do", admin.id)).toEqual({ ok: false, error: "notFound" });
    expect(await refundAdminOrder("not-a-code", "lý do", admin.id)).toEqual({ ok: false, error: "notFound" });
    expect(await refundAdminOrder(pending.code, "lý do", admin.id)).toEqual({ ok: false, error: "notPaid" });

    expect((await db().order.findUniqueOrThrow({ where: { id: pending.orderId } })).status).toBe("PENDING");
    expect(await refundRows(pending.code)).toHaveLength(0);
    expect(await db().auditLog.count({ where: { entity: "Order", entityId: pending.orderId } })).toBe(0);
  });

  it("a 0 ₫ order (100 % coupon) has nothing to refund", async () => {
    const customer = await createUser(tag, "zero");
    const order = await buy(customer.id, [p2.id], COUPON_FULL);
    expect(order.totalVnd).toBe(0);
    expect(await refundAdminOrder(order.code, "lý do", admin.id)).toEqual({ ok: false, error: "nothingToRefund" });
    expect((await getAdminOrder(order.code, "vi"))?.refundBlock).toBe("nothingToRefund");
    expect((await entitlement(customer.id, p2.id))?.revokedAt).toBeNull();
  });
});

describe("Refunding a paid order (DECISIONS #33)", () => {
  it("the whole order: REFUNDED, one Refund, access revoked, sales counted back, coupon still used, audited", async () => {
    const buyer = await createUser(tag, "buyer");
    const [sales1, sales2] = [await sales(p1.id), await sales(p2.id)];
    const order = await buy(buyer.id, [p1.id, p2.id], COUPON);
    expect(order.totalVnd).toBe(315_000); // 350.000 − 10 %
    expect([await sales(p1.id), await sales(p2.id)]).toEqual([sales1 + 1, sales2 + 1]);
    const couponBefore = await db().coupon.findUniqueOrThrow({ where: { code: COUPON } });
    expect((await getAdminOrder(order.code, "vi"))?.refundBlock).toBeNull();

    expect(await refundAdminOrder(order.code, "  Khách mua nhầm  ", admin.id)).toEqual({ ok: true, revoked: 2 });

    expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    const rows = await refundRows(order.code);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amountVnd: 315_000,
      reason: "Khách mua nhầm",
      status: "COMPLETED",
      adminId: admin.id,
    });
    for (const pack of [p1, p2]) {
      expect((await entitlement(buyer.id, pack.id))?.revokedAt).not.toBeNull();
      expect(await download(buyer.id, pack.id)).toEqual({ ok: false, reason: "notOwned" });
    }
    expect([await sales(p1.id), await sales(p2.id)]).toEqual([sales1, sales2]);
    // The coupon use stays counted (no "buy → refund → reuse the code").
    expect((await db().coupon.findUniqueOrThrow({ where: { code: COUPON } })).usedCount).toBe(couponBefore.usedCount);
    expect(await db().couponRedemption.count({ where: { orderId: order.id } })).toBe(1);
    const audit = await db().auditLog.findMany({ where: { entity: "Order", entityId: order.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ adminId: admin.id, action: "order.refund" });

    const view = await getAdminOrder(order.code, "vi");
    expect(view?.status).toBe("REFUNDED");
    expect(view?.refundBlock).toBe("notPaid");
    expect(view?.items.map((i) => i.access)).toEqual(["revoked", "revoked"]);
    expect(view?.refunds).toMatchObject([{ amountVnd: 315_000, reason: "Khách mua nhầm", status: "COMPLETED" }]);

    // A second refund changes nothing.
    expect(await refundAdminOrder(order.code, "lần hai", admin.id)).toEqual({ ok: false, error: "notPaid" });
    expect(await refundRows(order.code)).toHaveLength(1);
    expect([await sales(p1.id), await sales(p2.id)]).toEqual([sales1, sales2]);
  });

  it("two Admins refunding at the same moment: exactly one refund", async () => {
    const customer = await createUser(tag, "race");
    const before = await sales(p1.id);
    const order = await buy(customer.id, [p1.id]);
    const results = await Promise.all([
      refundAdminOrder(order.code, "Admin 1", admin.id),
      refundAdminOrder(order.code, "Admin 2", admin2.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "notPaid" }]);
    expect(await refundRows(order.code)).toHaveLength(1);
    expect(await db().auditLog.count({ where: { entity: "Order", entityId: order.id } })).toBe(1);
    expect(await sales(p1.id)).toBe(before);
  });

  it("only the access this order granted is revoked; buying again restores it, and that order is refundable too", async () => {
    const customer = await createUser(tag, "again");
    const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
    await db().entitlement.create({
      data: { userId: customer.id, productId: p2.id, licenseId: license.id, source: "ADMIN_GRANT" },
    }); // a gift

    const first = await buy(customer.id, [p1.id]);
    expect(await refundAdminOrder(first.code, "lý do", admin.id)).toEqual({ ok: true, revoked: 1 });
    expect((await entitlement(customer.id, p2.id))?.revokedAt).toBeNull(); // the gift stays
    expect((await download(customer.id, p2.id)).ok).toBe(true);

    const second = await buy(customer.id, [p1.id]);
    expect((await download(customer.id, p1.id)).ok).toBe(true);
    expect((await entitlement(customer.id, p1.id))?.orderId).toBe(second.id);
    expect(await refundAdminOrder(second.code, "lý do", admin.id)).toEqual({ ok: true, revoked: 1 });
    expect(await download(customer.id, p1.id)).toEqual({ ok: false, reason: "notOwned" });
    expect(await refundAdminOrder(first.code, "lý do", admin.id)).toEqual({ ok: false, error: "notPaid" });
  });

  it("bought downloads are taken back in full, even if some were used — never below zero; the pack stays in the library", async () => {
    const customer = await createUser(tag, "extra");
    await download(customer.id, free.id);
    await download(customer.id, free.id);
    const salesBefore = await sales(free.id);

    const extra = await buyExtraDownloads(customer.id, free.id);
    expect((await download(customer.id, free.id)).ok).toBe(true); // one of the bought two used
    expect(await getFreeDownloadQuota(customer.id, free.id)).toEqual({ left: 1, total: 4 });

    expect(await refundAdminOrder(extra.code, "lý do", admin.id)).toEqual({ ok: true, revoked: 0 });
    expect(
      (
        await db().downloadCredit.findUniqueOrThrow({
          where: { userId_productId: { userId: customer.id, productId: free.id } },
        })
      ).extraDownloads,
    ).toBe(0);
    expect((await getFreeDownloadQuota(customer.id, free.id))?.left).toBe(0);
    expect(await download(customer.id, free.id)).toEqual({ ok: false, reason: "quotaExhausted" });
    expect((await entitlement(customer.id, free.id))?.revokedAt).toBeNull(); // still saved in the library
    expect(await sales(free.id)).toBe(salesBefore); // a downloads order is not a pack sale

    // Two "+2" orders, one refunded: 2 bought downloads remain.
    const a = await buyExtraDownloads(customer.id, free.id);
    await buyExtraDownloads(customer.id, free.id);
    expect(await refundAdminOrder(a.code, "lý do", admin.id)).toMatchObject({ ok: true });
    expect(
      (
        await db().downloadCredit.findUniqueOrThrow({
          where: { userId_productId: { userId: customer.id, productId: free.id } },
        })
      ).extraDownloads,
    ).toBe(2);
  });
});

describe("Admin order list", () => {
  it("finds an order by code or email and filters by status", async () => {
    const customer = await createUser(tag, "listed");
    const order = await buy(customer.id, [p2.id]);
    const byCode = await listAdminOrders({ q: order.code.toLowerCase() }, "vi", 1);
    expect(byCode.items.map((o) => o.code)).toEqual([order.code]);
    const byEmail = await listAdminOrders({ q: `it-${tag}-listed` }, "vi", 1);
    expect(byEmail.items.map((o) => o.code)).toEqual([order.code]);
    expect((await listAdminOrders({ q: order.code, status: "PAID" }, "vi", 1)).total).toBe(1);
    expect((await listAdminOrders({ q: order.code, status: "REFUNDED" }, "vi", 1)).total).toBe(0);

    await refundAdminOrder(order.code, "lý do", admin.id);
    expect((await listAdminOrders({ q: order.code, status: "REFUNDED" }, "vi", 1)).items[0]?.status).toBe("REFUNDED");
    expect(await getAdminOrder("AG-20260101-AAAAAA", "vi")).toBeNull();
    expect(await getAdminOrder("../etc", "vi")).toBeNull();
  });
});
