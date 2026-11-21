import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSessionValid } from "@backend/auth/session-validation";
import { addToCart } from "@backend/modules/cart/service";
import { requestDownload } from "@backend/modules/download/service";
import { refundAdminOrder } from "@backend/modules/order/admin-service";
import {
  getAdminUser,
  giftAdminPack,
  listAdminUsers,
  lockAdminUser,
  revokeAdminGift,
  unlockAdminUser,
} from "@backend/modules/user/admin-service";
import { cleanup, createPack, createUser, db, eventId, newTag, placePendingOrder, sendWebhook } from "./fixtures";

/**
 * Admin users (GĐ5.5, DECISIONS #34) against the real services and the dev database: locking ends every session
 * (status + sessionVersion, re-checked on each request), only ordinary accounts can be locked, gifts are Premium
 * packs on sale the customer does not own, and only gifts can be taken back — each change once, with an AuditLog.
 */
const tag = newTag();
let admin: { id: string };
let admin2: { id: string };
let p1: Awaited<ReturnType<typeof createPack>>;
let p2: Awaited<ReturnType<typeof createPack>>;
let p3: Awaited<ReturnType<typeof createPack>>;
let hidden: Awaited<ReturnType<typeof createPack>>;
let free: Awaited<ReturnType<typeof createPack>>;

const state = (id: string) =>
  db().user.findUniqueOrThrow({ where: { id }, select: { id: true, role: true, status: true, sessionVersion: true } });
const audits = (userId: string, action: string) =>
  db().auditLog.count({ where: { entity: "User", entityId: userId, action } });
const download = (userId: string, productId: string) => requestDownload({ productId, userId, userAgent: "vitest" });
const entitlement = (userId: string, productId: string) =>
  db().entitlement.findUnique({ where: { userId_productId: { userId, productId } } });

async function buyPaid(userId: string, productId: string) {
  const order = await placePendingOrder(userId, productId, 150_000);
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
  await db().user.updateMany({ where: { id: { in: [admin.id, admin2.id] } }, data: { role: "ADMIN" } });
  [p1, p2, p3, hidden, free] = await Promise.all([
    createPack(tag, "p1", { type: "PREMIUM" }),
    createPack(tag, "p2", { type: "PREMIUM" }),
    createPack(tag, "p3", { type: "PREMIUM" }),
    createPack(tag, "hidden", { type: "PREMIUM", status: "HIDDEN" }),
    createPack(tag, "free", { type: "FREE" }),
  ]);
});

afterAll(async () => {
  await cleanup(tag);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().product.count({ where: { slug: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Locking (DECISIONS #34)", () => {
  it("refuses Admins, oneself, a missing reason and unknown ids — nothing changes", async () => {
    const customer = await createUser(tag, "refuse");
    expect(await lockAdminUser(admin2.id, "lý do", admin.id)).toEqual({ ok: false, error: "isAdmin" });
    expect(await lockAdminUser(admin.id, "lý do", admin.id)).toEqual({ ok: false, error: "self" });
    expect(await lockAdminUser(customer.id, "  ", admin.id)).toEqual({ ok: false, error: "reasonRequired" });
    expect(await lockAdminUser(customer.id, "x".repeat(501), admin.id)).toEqual({ ok: false, error: "tooLong" });
    expect(await lockAdminUser("cmissingmissingmissing00", "lý do", admin.id)).toEqual({
      ok: false,
      error: "notFound",
    });
    expect(await lockAdminUser("../x", "lý do", admin.id)).toEqual({ ok: false, error: "notFound" });
    for (const id of [customer.id, admin2.id, admin.id]) expect((await state(id)).status).toBe("ACTIVE");
    expect(await audits(customer.id, "user.lock")).toBe(0);
  });

  it("locking ends every existing session and keeps the library; unlocking lets the customer back in", async () => {
    const customer = await createUser(tag, "lockme");
    await buyPaid(customer.id, p1.id);
    const before = await state(customer.id);
    const claims = { uid: customer.id, sv: before.sessionVersion }; // what an existing JWT carries
    expect(isSessionValid(claims, before)).toBe(true);

    expect(await lockAdminUser(customer.id, "Gian lận thanh toán", admin.id)).toEqual({ ok: true });
    const locked = await state(customer.id);
    expect(locked.status).toBe("LOCKED");
    expect(locked.sessionVersion).toBe(before.sessionVersion + 1);
    expect(isSessionValid(claims, locked)).toBe(false); // the old JWT is dead on its next request
    expect(isSessionValid({ uid: customer.id, sv: locked.sessionVersion }, locked)).toBe(false); // even a fresh one while locked
    expect((await entitlement(customer.id, p1.id))?.revokedAt).toBeNull();
    const log = await db().auditLog.findFirstOrThrow({
      where: { entity: "User", entityId: customer.id, action: "user.lock" },
    });
    expect(log.adminId).toBe(admin.id);
    expect(log.diff).toEqual({ reason: "Gian lận thanh toán" });

    expect(await lockAdminUser(customer.id, "lần hai", admin.id)).toEqual({ ok: false, error: "alreadyLocked" });
    expect(await audits(customer.id, "user.lock")).toBe(1);

    expect(await unlockAdminUser(customer.id, "", admin.id)).toEqual({ ok: true });
    const back = await state(customer.id);
    expect(back.status).toBe("ACTIVE");
    expect(isSessionValid({ uid: customer.id, sv: back.sessionVersion }, back)).toBe(true); // a new sign-in works
    expect(isSessionValid(claims, back)).toBe(false); // the sessions from before the lock stay dead
    expect(await unlockAdminUser(customer.id, "", admin.id)).toEqual({ ok: false, error: "notLocked" });
    expect(await audits(customer.id, "user.unlock")).toBe(1);
  });

  it("two Admins locking at the same moment: locked once, one session bump", async () => {
    const customer = await createUser(tag, "race");
    const sv = (await state(customer.id)).sessionVersion;
    const results = await Promise.all([
      lockAdminUser(customer.id, "A", admin.id),
      lockAdminUser(customer.id, "B", admin2.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "alreadyLocked" }]);
    expect((await state(customer.id)).sessionVersion).toBe(sv + 1);
    expect(await audits(customer.id, "user.lock")).toBe(1);
  });
});

describe("Gifts (DECISIONS #34)", () => {
  it("a Premium pack on sale: downloadable, shown as gifted, out of the cart; refused for owned, free, hidden, unknown", async () => {
    const customer = await createUser(tag, "gift");
    const added = await addToCart({ kind: "user", userId: customer.id }, p2.id);
    expect(added.ok).toBe(true);

    expect(await giftAdminPack(customer.id, p2.id, " Quà sinh nhật ", admin.id)).toEqual({ ok: true });
    expect((await download(customer.id, p2.id)).ok).toBe(true);
    expect((await entitlement(customer.id, p2.id))?.source).toBe("ADMIN_GRANT");
    expect(await db().cartItem.count({ where: { cart: { userId: customer.id } } })).toBe(0);
    const log = await db().auditLog.findFirstOrThrow({
      where: { entity: "User", entityId: customer.id, action: "user.gift" },
    });
    expect(log.diff).toEqual({ productId: p2.id, note: "Quà sinh nhật" });

    expect(await giftAdminPack(customer.id, p2.id, "", admin.id)).toEqual({ ok: false, error: "alreadyOwned" });
    expect(await giftAdminPack(customer.id, free.id, "", admin.id)).toEqual({ ok: false, error: "notPremium" });
    expect(await giftAdminPack(customer.id, hidden.id, "", admin.id)).toEqual({ ok: false, error: "notPublished" });
    expect(await giftAdminPack(customer.id, `missing-${tag}`, "", admin.id)).toEqual({ ok: false, error: "notFound" });
    expect(await giftAdminPack("cmissingmissingmissing00", p2.id, "", admin.id)).toEqual({
      ok: false,
      error: "userNotFound",
    });
    expect(await audits(customer.id, "user.gift")).toBe(1);

    const view = await getAdminUser(customer.id, admin.id, "vi");
    const offered = view!.giftable.map((p) => p.id);
    expect(offered).toContain(p1.id);
    for (const id of [p2.id, free.id, hidden.id]) expect(offered).not.toContain(id);
    expect(view!.library.find((e) => e.productId === p2.id)).toMatchObject({ source: "ADMIN_GRANT", revokedAt: null });
  });

  it("only gifts are taken back; a gift taken back can be gifted again; a refunded purchase can become a gift", async () => {
    const customer = await createUser(tag, "takeback");
    expect(await giftAdminPack(customer.id, p1.id, "", admin.id)).toEqual({ ok: true });
    expect(await revokeAdminGift(customer.id, p1.id, admin.id)).toEqual({ ok: true });
    expect(await download(customer.id, p1.id)).toEqual({ ok: false, reason: "notOwned" });
    expect(await revokeAdminGift(customer.id, p1.id, admin.id)).toEqual({ ok: false, error: "notGift" });
    expect(await giftAdminPack(customer.id, p1.id, "", admin.id)).toEqual({ ok: true }); // again
    expect((await download(customer.id, p1.id)).ok).toBe(true);

    // A purchase is not a gift: it is taken back by refunding its order (5.4).
    const order = await buyPaid(customer.id, p3.id);
    expect(await revokeAdminGift(customer.id, p3.id, admin.id)).toEqual({ ok: false, error: "notGift" });
    expect((await download(customer.id, p3.id)).ok).toBe(true);
    expect(await refundAdminOrder(order.code, "lý do", admin.id)).toMatchObject({ ok: true });
    expect(await giftAdminPack(customer.id, p3.id, "", admin.id)).toEqual({ ok: true });
    expect(await entitlement(customer.id, p3.id)).toMatchObject({
      source: "ADMIN_GRANT",
      orderId: null,
      revokedAt: null,
    });
    expect(await audits(customer.id, "user.giftRevoke")).toBe(1);
  });

  it("several packs at once (Manual order box): all or nothing, one log row per pack", async () => {
    const customer = await createUser(tag, "giftmany");
    // One pack cannot be gifted → nothing is gifted.
    expect(await giftAdminPack(customer.id, [p1.id, free.id], "", admin.id)).toEqual({ ok: false, error: "notPremium" });
    expect(await db().entitlement.count({ where: { userId: customer.id } })).toBe(0);
    expect(await audits(customer.id, "user.gift")).toBe(0);
    expect(await giftAdminPack(customer.id, [], "", admin.id)).toEqual({ ok: false, error: "pickPack" });

    expect(await giftAdminPack(customer.id, [p1.id, p3.id, p1.id], "Quà", admin.id)).toEqual({ ok: true });
    expect((await download(customer.id, p1.id)).ok).toBe(true);
    expect((await download(customer.id, p3.id)).ok).toBe(true);
    expect(await audits(customer.id, "user.gift")).toBe(2);
  });

  it("two Admins gifting the same pack at the same moment: one gift", async () => {
    const customer = await createUser(tag, "giftrace");
    const results = await Promise.all([
      giftAdminPack(customer.id, p3.id, "", admin.id),
      giftAdminPack(customer.id, p3.id, "", admin2.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "alreadyOwned" }]);
    expect(await db().entitlement.count({ where: { userId: customer.id, productId: p3.id } })).toBe(1);
    expect(await audits(customer.id, "user.gift")).toBe(1);
  });
});

describe("Admin user list", () => {
  it("finds accounts by email or name and filters by role and status", async () => {
    const found = await listAdminUsers({ q: `it-${tag}-` }, 1);
    expect(found.total).toBeGreaterThanOrEqual(7);
    expect((await listAdminUsers({ q: `it-${tag}-`, role: "ADMIN" }, 1)).items.map((u) => u.id).sort()).toEqual(
      [admin.id, admin2.id].sort(),
    );
    const locked = await listAdminUsers({ q: `it-${tag}-`, status: "LOCKED" }, 1);
    expect(locked.items.every((u) => u.status === "LOCKED")).toBe(true);
    expect(locked.items.some((u) => u.email.includes("-race@"))).toBe(true);
    expect(await getAdminUser("../etc", admin.id, "vi")).toBeNull();
    expect((await getAdminUser(admin.id, admin.id, "vi"))?.lockBlock).toBe("self");
  });
});
