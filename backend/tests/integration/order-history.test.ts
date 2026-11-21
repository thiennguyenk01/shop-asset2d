import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listOrdersForUser, ORDERS_PAGE_SIZE } from "@backend/modules/order/service";
import { getAccountStats, RECENT_ORDERS } from "@backend/modules/stats/account-service";
import { cleanup, createPack, createUser, db, newTag, placePendingOrder } from "./fixtures";

/**
 * The customer's order history (/orders) and the "recent orders" of the stats page (/stats), user request
 * 2026-11-20: at most 5 orders per page, and only the last 3 orders on the stats page.
 */
const tag = newTag();
const ORDERS = 7;
let buyer: { id: string };
/** Order codes, newest first. */
const codes: string[] = [];

beforeAll(async () => {
  buyer = await createUser(tag, "history");
  const pack = await createPack(tag, "a", { type: "PREMIUM", priceVnd: 90_000 });
  for (let i = 0; i < ORDERS; i += 1) {
    // An unpaid order leaves its line in the cart, so the same pack can be ordered again.
    const placed = await placePendingOrder(buyer.id, pack.id, 90_000);
    // Distinct, increasing creation times so "newest first" is unambiguous.
    await db().order.update({ where: { id: placed.orderId }, data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) } });
    codes.unshift(placed.code);
  }
}, 120_000);

afterAll(async () => {
  await cleanup(tag);
});

describe("order history pages", () => {
  it("shows at most 5 orders per page, newest first", async () => {
    expect(ORDERS_PAGE_SIZE).toBe(5);
    const first = await listOrdersForUser(buyer.id, "vi", 1);
    expect(first.total).toBe(ORDERS);
    expect(first.pageCount).toBe(2);
    expect(first.page).toBe(1);
    expect(first.items.map((o) => o.code)).toEqual(codes.slice(0, 5));

    const second = await listOrdersForUser(buyer.id, "vi", 2);
    expect(second.page).toBe(2);
    expect(second.items.map((o) => o.code)).toEqual(codes.slice(5));
  });

  it("a page past the end shows the last page; a bad page number shows the first", async () => {
    expect((await listOrdersForUser(buyer.id, "vi", 99)).page).toBe(2);
    expect((await listOrdersForUser(buyer.id, "vi", Number.NaN)).page).toBe(1);
    expect((await listOrdersForUser(buyer.id, "vi", -3)).items.map((o) => o.code)).toEqual(codes.slice(0, 5));
  });
});

describe("stats page: recent orders", () => {
  it("lists only the last 3 orders, while the counts cover every order", async () => {
    expect(RECENT_ORDERS).toBe(3);
    const stats = await getAccountStats(buyer.id, "vi");
    expect(stats.orders.total).toBe(ORDERS);
    expect(stats.orders.recent.map((o) => o.code)).toEqual(codes.slice(0, 3));
  });
});
