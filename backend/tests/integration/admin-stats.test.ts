import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bucketKey } from "@backend/lib/admin/stats-rules";
import { listAuditLog } from "@backend/modules/audit/admin-service";
import { requestDownload } from "@backend/modules/download/service";
import { refundAdminOrder } from "@backend/modules/order/admin-service";
import { findTopFreeDownloads, findTopSellers } from "@backend/modules/stats/admin-repository";
import { getAdminAttention, getAdminStats } from "@backend/modules/stats/admin-service";
import { lockAdminUser } from "@backend/modules/user/admin-service";
import { cleanup, createPack, createUser, db, eventId, newTag, placePendingOrder, sendWebhook } from "./fixtures";

/**
 * Admin statistics + action log (GĐ5.7, DECISIONS #36) against the real services and the dev database. The dev
 * database holds other orders too, so revenue is checked as the change this file makes; the top lists are read
 * from this file's start.
 */
const tag = newTag();
const started = new Date(Date.now() - 1000);
let admin: { id: string };
let buyer: { id: string };
let p1: Awaited<ReturnType<typeof createPack>>;
let p2: Awaited<ReturnType<typeof createPack>>;
let free: Awaited<ReturnType<typeof createPack>>;

async function buyPaid(userId: string, productId: string, totalVnd: number) {
  const order = await placePendingOrder(userId, productId, totalVnd);
  const r = await sendWebhook({
    eventId: eventId(tag),
    txnId: order.txnId,
    orderCode: order.code,
    amountVnd: order.totalVnd,
    status: "SUCCEEDED",
  });
  expect(r.result).toBe("processed");
  return order;
}

const today = (s: Awaited<ReturnType<typeof getAdminStats>>) =>
  s.series.find((p) => p.key === bucketKey(new Date(), "day"))!;

beforeAll(async () => {
  [admin, buyer] = await Promise.all([createUser(tag, "admin"), createUser(tag, "buyer")]);
  await db().user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  [p1, p2, free] = await Promise.all([
    createPack(tag, "p1", { type: "PREMIUM", priceVnd: 300_000 }),
    createPack(tag, "p2", { type: "PREMIUM", priceVnd: 200_000 }),
    createPack(tag, "free", { type: "FREE" }),
  ]);
});

afterAll(async () => {
  await cleanup(tag);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Revenue (DECISIONS #36)", () => {
  it("real and Demo money stay apart, by the day paid; a refunded order leaves the figures", async () => {
    const before = await getAdminStats("7d", "vi");
    const demo = await buyPaid(buyer.id, p1.id, 300_000); // the dev site pays through the Demo gateway
    const real = await buyPaid(buyer.id, p2.id, 200_000);
    // Stand-in for a real gateway in this test only: the order is marked as not Demo.
    await db().order.update({ where: { id: real.orderId }, data: { isDemo: false } });

    const after = await getAdminStats("7d", "vi");
    expect(after.totals.demoVnd - before.totals.demoVnd).toBe(300_000);
    expect(after.totals.realVnd - before.totals.realVnd).toBe(200_000);
    expect(after.totals.realOrders - before.totals.realOrders).toBe(1);
    expect(today(after).demoVnd - today(before).demoVnd).toBe(300_000);
    expect(today(after).realVnd - today(before).realVnd).toBe(200_000);
    expect(after.series).toHaveLength(7);

    expect(await refundAdminOrder(demo.code, "thống kê", admin.id)).toMatchObject({ ok: true });
    const refunded = await getAdminStats("7d", "vi");
    expect(refunded.totals.demoVnd).toBe(before.totals.demoVnd);
    expect(refunded.totals.realVnd - before.totals.realVnd).toBe(200_000);

    // Best sellers since this file started: p2 (still paid, real); p1 was refunded.
    const sellers = await findTopSellers(started, 50);
    expect(sellers.find((s) => s.productId === p2.id)).toMatchObject({ realCount: 1, demoCount: 0 });
    expect(sellers.find((s) => s.productId === p1.id)).toBeUndefined();
  });

  it("free downloads are counted per free pack", async () => {
    for (let i = 0; i < 2; i++)
      expect((await requestDownload({ productId: free.id, userId: buyer.id, userAgent: "vitest" })).ok).toBe(true);
    const top = await findTopFreeDownloads(started, 50);
    expect(top.find((t) => t.productId === free.id)?._count._all).toBe(2);
    expect(top.some((t) => t.productId === p2.id)).toBe(false); // Premium packs are not in this list
  });
});

describe("Needs attention (the Admin bell)", () => {
  it("counts a live order awaiting payment, with the newest one's time", async () => {
    const before = await getAdminAttention();
    const order = await placePendingOrder(buyer.id, p1.id, 300_000);
    const after = await getAdminAttention();
    expect(after.pending.count - before.pending.count).toBe(1);
    const created = await db().order.findUniqueOrThrow({ where: { id: order.orderId }, select: { createdAt: true } });
    expect(after.pending.latestAt?.getTime()).toBe(created.createdAt.getTime());
  });

  it("lists a pack not written in every language yet, until the missing ones are added (DECISIONS #39)", async () => {
    // Fixture packs are written in VI only: hidden in EN and ZH.
    const listed = (await getAdminAttention()).untranslated.find((u) => u.id === p1.id);
    expect(listed).toMatchObject({ title: "IT p1", missing: ["en", "zh"] });
    const text = { title: "IT p1", shortDescription: "integration test", description: "integration test", contentsList: [] };
    await db().productTranslation.createMany({ data: (["en", "zh"] as const).map((locale) => ({ productId: p1.id, locale, ...text })) });
    await db().product.update({ where: { id: p1.id }, data: { updatedAt: new Date() } });
    expect((await getAdminAttention()).untranslated.some((u) => u.id === p1.id)).toBe(false);
  });
});

describe("Action log (DECISIONS #36)", () => {
  it("lists this Admin's actions newest first, filtered by action and day, with links to the order / account", async () => {
    expect(await lockAdminUser(buyer.id, "nhật ký", admin.id)).toEqual({ ok: true });
    const mine = await listAuditLog({ adminId: admin.id }, 1);
    expect(mine.items.map((r) => r.action)).toEqual(["user.lock", "order.refund"]);
    expect(mine.items[0]).toMatchObject({ href: `/admin/users/${buyer.id}`, adminId: admin.id });
    const refund = mine.items[1];
    expect(refund.href).toMatch(/^\/admin\/orders\/AG-\d{8}-[A-Z0-9]{6}$/);
    expect(refund.label).toBe(refund.href!.split("/").pop());

    expect((await listAuditLog({ adminId: admin.id, action: "order.refund" }, 1)).items).toHaveLength(1);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect((await listAuditLog({ adminId: admin.id, since: tomorrow }, 1)).total).toBe(0);
    expect((await listAuditLog({ adminId: admin.id, until: started }, 1)).total).toBe(0);
  });
});
