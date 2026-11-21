import { utimes } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GUEST_CART_DAYS, ORDER_EXPIRE_GRACE_MINUTES, ORPHAN_UPLOAD_HOURS } from "@backend/lib/cron/rules";
import { getEnv } from "@backend/env";
import { cleanupStaleData, reconcileOrders } from "@backend/modules/maintenance/service";
import { getStorage } from "@backend/storage";
import { cleanup, createPack, createUser, db, eventId, newTag, placePendingOrder, sendWebhook } from "./fixtures";

/**
 * Scheduled jobs (GĐ6.3) against the real services, the dev database and the local storage: overdue orders,
 * guest carts and abandoned uploads. Each job also touches other matching dev rows (it is meant to); the checks
 * here only look at this run's rows.
 */
const tag = newTag();
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const keyOf = (name: string) => `packs/it-${tag}/media/${name}.png`;
/** Back-date a local object (the local driver keeps objects as files under STORAGE_LOCAL_ROOT/<bucket>/). */
const ageObject = (key: string, hours: number) => {
  const t = new Date(Date.now() - hours * 3_600_000);
  return utimes(path.resolve(getEnv().STORAGE_LOCAL_ROOT, "public", key), t, t);
};

let buyer: { id: string };
let packA: Awaited<ReturnType<typeof createPack>>;
let packB: Awaited<ReturnType<typeof createPack>>;

beforeAll(async () => {
  buyer = await createUser(tag, "buyer");
  [packA, packB] = await Promise.all([
    createPack(tag, "a", { type: "PREMIUM", priceVnd: 120_000 }),
    createPack(tag, "b", { type: "PREMIUM", priceVnd: 140_000 }),
  ]);
});

afterAll(async () => {
  await db().cart.deleteMany({ where: { guestToken: { startsWith: `it-${tag}-` } } });
  for (const name of ["orphan", "used", "fresh"]) await getStorage().remove("public", keyOf(name));
  await cleanup(tag);
  expect(await db().cart.count({ where: { guestToken: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("reconcile: overdue orders (GĐ6.3)", () => {
  it(`writes EXPIRED only ${ORDER_EXPIRE_GRACE_MINUTES} minutes after the expiry; a late payment then changes nothing`, async () => {
    // Two buyers: an order takes the whole cart, and an unpaid order leaves its lines in the cart.
    const buyer2 = await createUser(tag, "buyer2");
    const overdue = await placePendingOrder(buyer.id, packA.id, 120_000);
    const late = await placePendingOrder(buyer2.id, packB.id, 140_000);
    await db().order.update({
      where: { id: overdue.orderId },
      data: { expiresAt: ago(ORDER_EXPIRE_GRACE_MINUTES + 5) },
    });
    await db().order.update({ where: { id: late.orderId }, data: { expiresAt: ago(ORDER_EXPIRE_GRACE_MINUTES - 5) } });

    const report = await reconcileOrders();
    expect(report.expiredOrders).toBeGreaterThanOrEqual(1);
    const status = async (id: string) =>
      (await db().order.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
    expect(await status(overdue.orderId)).toBe("EXPIRED");
    expect(await status(late.orderId)).toBe("PENDING"); // still inside the grace period

    // A confirmation for the expired order is acknowledged and ignored: no pack is granted.
    const ignored = await sendWebhook({
      eventId: eventId(tag),
      txnId: overdue.txnId,
      orderCode: overdue.code,
      amountVnd: 120_000,
      status: "SUCCEEDED",
    });
    expect(ignored.result).toBe("ignored");
    expect(await status(overdue.orderId)).toBe("EXPIRED");
    expect(await db().entitlement.count({ where: { userId: buyer.id, productId: packA.id } })).toBe(0);

    // Inside the grace period the order can still be paid.
    const paid = await sendWebhook({
      eventId: eventId(tag),
      txnId: late.txnId,
      orderCode: late.code,
      amountVnd: 140_000,
      status: "SUCCEEDED",
    });
    expect(paid.result).toBe("processed");
    expect(await status(late.orderId)).toBe("PAID");

    // Running again changes nothing for these orders.
    await reconcileOrders();
    expect(await status(overdue.orderId)).toBe("EXPIRED");
    expect(await status(late.orderId)).toBe("PAID");
  });
});

describe("cleanup: guest carts and abandoned uploads (GĐ6.3)", () => {
  it(`removes guest carts untouched for ${GUEST_CART_DAYS} days, never an account's cart or a recently changed one`, async () => {
    const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
    const old = ago((GUEST_CART_DAYS + 1) * 24 * 60);
    const line = { productId: packA.id, licenseId: license.id };
    const stale = await db().cart.create({
      data: { guestToken: `it-${tag}-stale`, updatedAt: old, items: { create: { ...line, updatedAt: old } } },
    });
    const busy = await db().cart.create({
      data: { guestToken: `it-${tag}-busy`, updatedAt: old, items: { create: line } },
    }); // line added today
    const empty = await db().cart.create({ data: { guestToken: `it-${tag}-empty`, updatedAt: old } });
    const owner = await createUser(tag, "owner");
    const account = await db().cart.create({ data: { userId: owner.id, updatedAt: old } });

    const report = await cleanupStaleData();
    expect(report.guestCarts).toBeGreaterThanOrEqual(2);
    const exists = async (id: string) => (await db().cart.count({ where: { id } })) === 1;
    expect(await exists(stale.id)).toBe(false);
    expect(await exists(empty.id)).toBe(false);
    expect(await exists(busy.id)).toBe(true);
    expect(await exists(account.id)).toBe(true);
    expect(await db().cartItem.count({ where: { cartId: stale.id } })).toBe(0); // its lines went with it
  });

  it(`removes uploads nothing refers to after ${ORPHAN_UPLOAD_HOURS} hours; keeps used and recent ones`, async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const name of ["orphan", "used", "fresh"]) await getStorage().put("public", keyOf(name), png);
    await ageObject(keyOf("orphan"), ORPHAN_UPLOAD_HOURS + 1);
    await ageObject(keyOf("used"), ORPHAN_UPLOAD_HOURS + 1);
    await db().productMedia.create({
      data: { productId: packA.id, kind: "IMAGE", storageKey: keyOf("used"), mimeType: "image/png" },
    });

    const report = await cleanupStaleData();
    expect(report.orphanUploads).toBeGreaterThanOrEqual(1);
    expect(await getStorage().exists("public", keyOf("orphan"))).toBe(false);
    expect(await getStorage().exists("public", keyOf("used"))).toBe(true);
    expect(await getStorage().exists("public", keyOf("fresh"))).toBe(true);
  });
});
