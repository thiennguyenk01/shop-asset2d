import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createManualOrder, getAdminOrderMoney, refundAdminOrder } from "@backend/modules/order/admin-service";
import { getOpenTransferTotals, listUnmatchedTransfers, resolveUnmatchedTransfer } from "@backend/modules/payment/admin-service";
import { cleanup, createPack, createUser, db, eventId, newTag, placePendingOrder, sendWebhook } from "./fixtures";

/**
 * Admin finance figures on the order page (user request 2026-11-21) and the unmatched-transfer list
 * (DECISIONS #45), against the dev database. Runs with the Demo gateway, like the other order tests.
 */
const tag = newTag();
const externalIds: string[] = [];
let admin: { id: string; email: string };
let buyer: { id: string; email: string };

async function transferRow(fields: { amountVnd: number; reason: "NO_ORDER" | "AMOUNT_MISMATCH" | "ORDER_CLOSED"; orderCode?: string; isDemo?: boolean }) {
  const externalId = `it${tag}${externalIds.length + 1}`;
  externalIds.push(externalId);
  return db().unmatchedTransfer.create({
    data: {
      provider: "SEPAY",
      externalId,
      reason: fields.reason,
      amountVnd: fields.amountVnd,
      content: `it ${tag} memo`,
      orderCode: fields.orderCode ?? null,
      bankAccount: "0000000002",
      isDemo: fields.isDemo ?? false,
      payload: { test: true },
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  admin = await createUser(tag, "money-admin");
  buyer = await createUser(tag, "money-buyer");
});

afterAll(async () => {
  await db().unmatchedTransfer.deleteMany({ where: { provider: "SEPAY", externalId: { in: externalIds } } });
  await cleanup(tag);
  expect(await db().unmatchedTransfer.count({ where: { externalId: { in: externalIds } } })).toBe(0);
});

describe("order money, for the list filters", () => {
  it("counts every matching order (not only one page), real and Demo apart, overdue PENDING as not collected", async () => {
    const pack = await createPack(tag, "money", { type: "PREMIUM", priceVnd: 120_000 });
    const pack2 = await createPack(tag, "money2", { type: "PREMIUM", priceVnd: 80_000 });
    const pack3 = await createPack(tag, "money3", { type: "PREMIUM", priceVnd: 50_000 });

    const paid = await placePendingOrder(buyer.id, pack.id, 120_000);
    expect((await sendWebhook({ eventId: eventId(tag), txnId: paid.txnId, orderCode: paid.code, amountVnd: 120_000, status: "SUCCEEDED" })).status).toBe(200);
    // One pack per order: a PENDING order leaves its pack in the cart, so empty the cart before the next one.
    const emptyCart = () => db().cartItem.deleteMany({ where: { cart: { userId: buyer.id } } });
    await emptyCart();
    // The overdue one first: an account has one order waiting for payment at a time (2026-11-26).
    const overdue = await placePendingOrder(buyer.id, pack3.id, 50_000);
    await db().order.update({ where: { id: overdue.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await emptyCart();
    const waiting = await placePendingOrder(buyer.id, pack2.id, 80_000);
    // The Demo gateway marks orders Demo: make two of them "real" to see both buckets.
    await db().order.updateMany({ where: { id: { in: [paid.orderId, waiting.orderId] } }, data: { isDemo: false } });

    const money = await getAdminOrderMoney({ q: buyer.email });
    expect(money.real.paid).toEqual({ orders: 1, totalVnd: 120_000 });
    expect(money.real.pending).toEqual({ orders: 1, totalVnd: 80_000 });
    expect(money.real.averagePaidVnd).toBe(120_000);
    expect(money.demo.unpaid).toEqual({ orders: 1, totalVnd: 50_000 }); // overdue: not collected
    expect(money.demo.pending).toEqual({ orders: 0, totalVnd: 0 });
    expect(money.real.all.orders + money.demo.all.orders).toBe(3);

    // The status filter narrows the money the same way it narrows the list.
    const expired = await getAdminOrderMoney({ q: buyer.email, status: "EXPIRED" });
    expect(expired.demo.unpaid).toEqual({ orders: 1, totalVnd: 50_000 });
    expect(expired.real.all.orders).toBe(0);
  });
});

describe("unmatched transfers", () => {
  it("lists the waiting ones with their totals; a known order code links to the order", async () => {
    const order = await db().order.findFirstOrThrow({ where: { userId: buyer.id }, select: { code: true } });
    const before = await getOpenTransferTotals();
    await transferRow({ amountVnd: 149_000, reason: "AMOUNT_MISMATCH", orderCode: order.code });
    await transferRow({ amountVnd: 50_000, reason: "NO_ORDER", isDemo: true });
    const after = await getOpenTransferTotals();
    expect(after.real.count - before.real.count).toBe(1);
    expect(after.real.amountVnd - before.real.amountVnd).toBe(149_000);
    expect(after.demo.count - before.demo.count).toBe(1);

    const list = await listUnmatchedTransfers({ state: "all", page: 1 });
    const mine = list.items.filter((i) => externalIds.includes(i.externalId));
    expect(mine.find((i) => i.reason === "AMOUNT_MISMATCH")).toMatchObject({ orderCode: order.code, orderExists: true, isDemo: false, resolved: null });
    expect(mine.find((i) => i.reason === "NO_ORDER")).toMatchObject({ orderCode: null, orderExists: false, isDemo: true });
  });

  it("marking one handled needs a note, is logged once, and a second click changes nothing", async () => {
    const row = await transferRow({ amountVnd: 75_000, reason: "ORDER_CLOSED" });
    expect(await resolveUnmatchedTransfer(row.id, "   ", admin.id)).toEqual({ ok: false, error: "noteRequired" });
    expect(await resolveUnmatchedTransfer("not an id!", "ok", admin.id)).toEqual({ ok: false, error: "notFound" });

    expect(await resolveUnmatchedTransfer(row.id, "Đã hoàn tiền ngoài web", admin.id)).toEqual({ ok: true });
    const saved = await db().unmatchedTransfer.findUniqueOrThrow({ where: { id: row.id }, select: { resolvedAt: true, resolvedById: true, resolutionNote: true, amountVnd: true } });
    expect(saved).toMatchObject({ resolvedById: admin.id, resolutionNote: "Đã hoàn tiền ngoài web", amountVnd: 75_000 });
    expect(saved.resolvedAt).not.toBeNull();
    expect(await resolveUnmatchedTransfer(row.id, "lần hai", admin.id)).toEqual({ ok: false, error: "alreadyResolved" });

    const logs = await db().auditLog.findMany({ where: { adminId: admin.id, action: "transfer.resolve", entityId: row.id }, select: { entity: true, diff: true } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "UnmatchedTransfer", diff: { amountVnd: 75_000, reason: "ORDER_CLOSED", note: "Đã hoàn tiền ngoài web" } });

    const resolved = await listUnmatchedTransfers({ state: "resolved", page: 1 });
    expect(resolved.items.find((i) => i.id === row.id)?.resolved).toMatchObject({ by: admin.email, note: "Đã hoàn tiền ngoài web" });
    const open = await listUnmatchedTransfers({ state: "open", page: 1 });
    expect(open.items.some((i) => i.id === row.id)).toBe(false);
  });
});

describe("manual order (user choice 2026-11-21: the customer paid by a private transfer)", () => {
  const form = (productIds: string[], amount: string, transferId = "") => ({ productIds, amount, note: "Chuyển khoản MB riêng", transferId });

  it("creates a PAID order: packs in the library as a purchase, counted as real money, logged, refundable", async () => {
    const customer = await createUser(tag, "manual-buyer");
    const a = await createPack(tag, "manual-a", { type: "PREMIUM", priceVnd: 150_000 });
    const b = await createPack(tag, "manual-b", { type: "PREMIUM", priceVnd: 80_000 });
    const before = await db().product.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, salesCount: true } });

    const made = await createManualOrder(customer.id, form([a.id, b.id], "200.000"), admin.id);
    expect(made.ok).toBe(true);
    const code = (made as { code: string }).code;
    const order = await db().order.findUniqueOrThrow({
      where: { code },
      select: {
        id: true, status: true, isDemo: true, subtotalVnd: true, discountVnd: true, totalVnd: true, paidAt: true, buyerEmail: true,
        payments: { select: { provider: true, status: true, amountVnd: true } },
        items: { select: { productId: true, priceSnapshotVnd: true } },
      },
    });
    expect(order).toMatchObject({
      status: "PAID", isDemo: false, subtotalVnd: 230_000, discountVnd: 30_000, totalVnd: 200_000, buyerEmail: customer.email,
      payments: [{ provider: "MANUAL", status: "SUCCEEDED", amountVnd: 200_000 }],
    });
    expect(order.paidAt).not.toBeNull();
    expect(order.items).toHaveLength(2);
    const ents = await db().entitlement.findMany({ where: { userId: customer.id }, select: { source: true, orderId: true, revokedAt: true } });
    expect(ents).toHaveLength(2);
    expect(ents.every((e) => e.source === "PURCHASE" && e.orderId === order.id && e.revokedAt === null)).toBe(true);
    const after = await db().product.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, salesCount: true } });
    for (const p of after) expect(p.salesCount).toBe(before.find((x) => x.id === p.id)!.salesCount + 1);
    expect(await db().auditLog.count({ where: { adminId: admin.id, action: "order.manual", entityId: order.id } })).toBe(1);

    const money = await getAdminOrderMoney({ q: customer.email });
    expect(money.real.paid).toEqual({ orders: 1, totalVnd: 200_000 });
    expect(money.real.discountVnd).toBe(30_000);

    // Owned now: a second manual order for the same pack is refused, nothing written.
    expect(await createManualOrder(customer.id, form([a.id], "150000"), admin.id)).toEqual({ ok: false, error: "alreadyOwned" });
    // A refund takes the packs back like any purchase.
    expect((await refundAdminOrder(code, "Khách đổi ý", admin.id)).ok).toBe(true);
    expect(await db().entitlement.count({ where: { userId: customer.id, revokedAt: null } })).toBe(0);
  });

  it("refuses an amount above the list price, a free pack, an unknown account — and writes nothing", async () => {
    const customer = await createUser(tag, "manual-refused");
    const premium = await createPack(tag, "manual-c", { type: "PREMIUM", priceVnd: 90_000 });
    const free = await createPack(tag, "manual-free", { type: "FREE", priceVnd: 0 });
    expect(await createManualOrder(customer.id, form([premium.id], "90001"), admin.id)).toEqual({ ok: false, error: "amountTooHigh" });
    expect(await createManualOrder(customer.id, form([premium.id, free.id], "90000"), admin.id)).toEqual({ ok: false, error: "packUnavailable" });
    expect(await createManualOrder("cmnosuchuser000000", form([premium.id], "90000"), admin.id)).toEqual({ ok: false, error: "userNotFound" });
    expect(await createManualOrder(customer.id, form([premium.id], "90000"), admin.id).then((r) => r.ok)).toBe(true);
    expect(await db().order.count({ where: { userId: customer.id } })).toBe(1);
  });

  it("linked to an unmatched transfer: the transfer is marked handled; a test transfer makes a Demo order; a handled one is refused", async () => {
    const customer = await createUser(tag, "manual-linked");
    const pack = await createPack(tag, "manual-d", { type: "PREMIUM", priceVnd: 60_000 });
    const pack2 = await createPack(tag, "manual-e", { type: "PREMIUM", priceVnd: 70_000 });
    const test = await transferRow({ amountVnd: 60_000, reason: "NO_ORDER", isDemo: true });

    const made = await createManualOrder(customer.id, form([pack.id], "60000", test.id), admin.id);
    expect(made.ok).toBe(true);
    const code = (made as { code: string }).code;
    expect((await db().order.findUniqueOrThrow({ where: { code }, select: { isDemo: true } })).isDemo).toBe(true);
    const handled = await db().unmatchedTransfer.findUniqueOrThrow({ where: { id: test.id }, select: { resolvedAt: true, resolvedById: true, resolutionNote: true } });
    expect(handled.resolvedById).toBe(admin.id);
    expect(handled.resolutionNote).toContain(code);

    // The same transfer cannot settle a second order.
    expect(await createManualOrder(customer.id, form([pack2.id], "70000", test.id), admin.id)).toEqual({ ok: false, error: "transferUnavailable" });
    expect(await db().entitlement.count({ where: { userId: customer.id, productId: pack2.id } })).toBe(0);
  });
});
