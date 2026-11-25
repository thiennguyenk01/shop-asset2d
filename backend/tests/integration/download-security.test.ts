import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DOWNLOAD_HOURLY_CAP, DEFAULT_EXTRA_DOWNLOADS, FREE_DOWNLOADS_PER_PACK } from "@backend/lib/download/rules";
import { getFreeDownloadQuota, requestDownload, type DownloadResult } from "@backend/modules/download/service";
import { refundAdminOrder } from "@backend/modules/order/admin-service";
import { verifyFileToken } from "@backend/storage/file-token";
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
  setStatus,
  pinExtraDownloadsOffer,
} from "./fixtures";

/**
 * CLAUDE.md §7 "Test bắt buộc", against the real services and the dev database:
 * the download service decides, the webhook alone grants, and nothing else opens a sellable file.
 */
const tag = newTag();
const PRICE = 150_000;

let buyer: { id: string };
let stranger: { id: string };
let refunder: { id: string };
let premium: Awaited<ReturnType<typeof createPack>>;
let otherPremium: Awaited<ReturnType<typeof createPack>>;
let free: Awaited<ReturnType<typeof createPack>>;
let free2: Awaited<ReturnType<typeof createPack>>;

const asUser = (userId: string, productId: string, fileId?: string) =>
  requestDownload({ productId, fileId, userId, userAgent: "vitest" });
const asGuest = (productId: string, fileId?: string) =>
  requestDownload({ productId, fileId, userId: null, userAgent: "vitest" });

function expectBlocked(result: DownloadResult, reason: string) {
  expect(result).toEqual({ ok: false, reason });
  expect(result).not.toHaveProperty("url");
}

/** A granted download is a short-lived token for exactly this pack's private file. */
function expectFileOf(result: DownloadResult, pack: { storageKey: string }) {
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.url).toMatch(/^\/api\/files\/[\w-]+\.[\w-]+$/);
  const payload = verifyFileToken(result.url.split("/").pop(), process.env.AUTH_SECRET);
  expect(payload?.k).toBe(pack.storageKey);
  expect(payload!.e * 1000 - Date.now()).toBeLessThanOrEqual(60_000);
}

const logCount = (productId: string) => db().downloadLog.count({ where: { productId } });
const entitlementOf = (userId: string, productId: string) =>
  db().entitlement.findUnique({ where: { userId_productId: { userId, productId } } });

let restoreOffer: () => Promise<void>;

beforeAll(async () => {
  restoreOffer = await pinExtraDownloadsOffer(DEFAULT_EXTRA_DOWNLOADS); // the counts below assume +2 / 10.000 ₫
  [buyer, stranger, refunder] = await Promise.all([
    createUser(tag, "buyer"),
    createUser(tag, "stranger"),
    createUser(tag, "refunder"),
  ]);
  [premium, otherPremium, free, free2] = await Promise.all([
    createPack(tag, "premium", { type: "PREMIUM", priceVnd: PRICE }),
    createPack(tag, "premium2", { type: "PREMIUM", priceVnd: PRICE }),
    createPack(tag, "free", { type: "FREE" }),
    createPack(tag, "free2", { type: "FREE" }),
  ]);
});

afterAll(async () => {
  await restoreOffer();
  await cleanup(tag);
  // The dev database is shared with the running site: nothing of this run may stay behind.
  expect(await db().product.count({ where: { slug: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().webhookEvent.count({ where: { eventId: { startsWith: `evt_it${tag}` } } })).toBe(0);
});

describe("Premium pack (§7)", () => {
  it("a guest or a signed-in user who has not bought it gets no file, and nothing is logged", async () => {
    expectBlocked(await asGuest(premium.id), "signInRequired");
    expectBlocked(await asGuest(premium.id, premium.fileId), "signInRequired");
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");
    expectBlocked(await asUser(buyer.id, premium.id, premium.fileId), "notOwned");
    expect(await logCount(premium.id)).toBe(0);
  });

  it("an unpaid order (pending, then failed) grants nothing", async () => {
    const order = await placePendingOrder(buyer.id, premium.id, PRICE);
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");

    expect(
      await sendWebhook({
        eventId: eventId(tag),
        txnId: order.txnId,
        orderCode: order.code,
        amountVnd: PRICE,
        status: "FAILED",
      }),
    ).toEqual({
      status: 200,
      result: "processed",
    });
    expect((await db().order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("FAILED");
    expect(await entitlementOf(buyer.id, premium.id)).toBeNull();
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");
  });

  it("a forged, underpaid, misaddressed or foreign-provider webhook is refused and grants nothing", async () => {
    const order = await placePendingOrder(buyer.id, premium.id, PRICE);
    const base = { txnId: order.txnId, orderCode: order.code, amountVnd: PRICE, status: "SUCCEEDED" as const };

    expect(
      await sendWebhook({ ...base, eventId: eventId(tag) }, { secret: "not-the-secret-not-the-secret-0000" }),
    ).toEqual({ status: 401, result: "invalidSignature" });
    expect(await sendWebhook({ ...base, eventId: eventId(tag), amountVnd: PRICE - 1 })).toEqual({
      status: 400,
      result: "amountMismatch",
    });
    expect(await sendWebhook({ ...base, eventId: eventId(tag), orderCode: "AG-20260101-AAAAAA" })).toEqual({
      status: 400,
      result: "orderMismatch",
    });
    expect(await sendWebhook({ ...base, eventId: eventId(tag) }, { slug: "payos" })).toEqual({
      status: 404,
      result: "unknownProvider",
    });

    expect((await db().order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("PENDING");
    expect(await entitlementOf(buyer.id, premium.id)).toBeNull();
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");
    // Let it expire, so the next test can place an order (one waiting for payment per account, 2026-11-26).
    await db().order.update({ where: { id: order.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  });

  it("the same paid event delivered 3× at once grants once: one entitlement, one sale", async () => {
    const order = await placePendingOrder(buyer.id, premium.id, PRICE);
    const event = {
      eventId: eventId(tag),
      txnId: order.txnId,
      orderCode: order.code,
      amountVnd: PRICE,
      status: "SUCCEEDED" as const,
    };

    const results = await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.map((r) => r.result).sort()).toEqual(["duplicate", "duplicate", "processed"]);

    expect(await db().entitlement.count({ where: { userId: buyer.id, productId: premium.id } })).toBe(1);
    expect((await db().product.findUniqueOrThrow({ where: { id: premium.id } })).salesCount).toBe(1);
    expect(await db().webhookEvent.count({ where: { eventId: event.eventId } })).toBe(1);
    expect((await db().order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("PAID");
  });

  it("the owner downloads this pack's file only — never another pack's file, and other users still cannot", async () => {
    const result = await asUser(buyer.id, premium.id);
    expectFileOf(result, premium);
    expectFileOf(await asUser(buyer.id, premium.id, premium.fileId), premium);
    // Unlimited: well past the free quota, still downloads, nothing counted against it.
    for (let i = 0; i < FREE_DOWNLOADS_PER_PACK + 2; i++) {
      const again = await asUser(buyer.id, premium.id);
      expectFileOf(again, premium);
      expect(again.ok && again.remaining).toBeNull();
    }
    // A file id of another pack (bought or not) is not a file of this pack.
    expectBlocked(await asUser(buyer.id, premium.id, otherPremium.fileId), "notFound");
    expectBlocked(await asUser(buyer.id, premium.id, free.fileId), "notFound");
    // Owning one pack does not open another.
    expectBlocked(await asUser(buyer.id, otherPremium.id), "notOwned");
    expectBlocked(await asUser(stranger.id, premium.id), "notOwned");
    expectBlocked(await asGuest(premium.id), "signInRequired");
  });

  it("a hidden or draft pack is not downloadable even by its owner; publishing it again restores access", async () => {
    for (const status of ["HIDDEN", "DRAFT"] as const) {
      await setStatus(premium.id, status);
      expectBlocked(await asUser(buyer.id, premium.id), "notFound");
      expectBlocked(await asUser(buyer.id, premium.id, premium.fileId), "notFound");
    }
    await setStatus(premium.id, "PUBLISHED");
    expectFileOf(await asUser(buyer.id, premium.id), premium);
  });

  it("a refunded order (entitlement revoked) stops downloads, and a late paid event does not bring it back", async () => {
    const paid = await db().order.findFirstOrThrow({
      where: { userId: buyer.id, status: "PAID", items: { some: { productId: premium.id } } },
      select: { id: true, code: true, totalVnd: true, payments: { select: { providerTxnId: true } } },
    });
    // The real Admin refund (GĐ5.4, ARCHITECTURE §4 step 8): order REFUNDED + the entitlement it granted revoked.
    expect(await refundAdminOrder(paid.code, "integration test", refunder.id)).toEqual({ ok: true, revoked: 1 });
    expect((await db().order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe("REFUNDED");
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");

    const late = await sendWebhook({
      eventId: eventId(tag),
      txnId: paid.payments[0].providerTxnId!,
      orderCode: paid.code,
      amountVnd: paid.totalVnd,
      status: "SUCCEEDED",
    });
    expect(late).toEqual({ status: 200, result: "ignored" });
    expect((await entitlementOf(buyer.id, premium.id))?.revokedAt).not.toBeNull();
    expectBlocked(await asUser(buyer.id, premium.id), "notOwned");
  });
});

describe("Free pack (§5, §7)", () => {
  it("a guest gets nothing — no file, no log, no claim", async () => {
    expectBlocked(await asGuest(free.id), "signInRequired");
    expectBlocked(await asGuest(free.id, free.fileId), "signInRequired");
    expect(await logCount(free.id)).toBe(0);
    expect(await db().entitlement.count({ where: { productId: free.id } })).toBe(0);
  });

  it(`an account downloads a pack ${FREE_DOWNLOADS_PER_PACK} times, for life; the first saves it to the library`, async () => {
    const first = await asUser(stranger.id, free.id);
    expectFileOf(first, free);
    expect(first.ok && [first.claimed, first.remaining]).toEqual([true, 1]);
    expect((await entitlementOf(stranger.id, free.id))?.source).toBe("FREE_CLAIM");

    const second = await asUser(stranger.id, free.id);
    expectFileOf(second, free);
    expect(second.ok && [second.claimed, second.remaining]).toEqual([false, 0]);

    expectBlocked(await asUser(stranger.id, free.id), "quotaExhausted");
    expectBlocked(await asUser(stranger.id, free.id, free.fileId), "quotaExhausted");
    expect(await getFreeDownloadQuota(stranger.id, free.id)).toEqual({ left: 0, total: 2 });
    expect(await db().downloadLog.count({ where: { productId: free.id, userId: stranger.id } })).toBe(2);
    // Still in the library, just no downloads left.
    expect((await entitlementOf(stranger.id, free.id))?.revokedAt).toBeNull();
  });

  it("the quota is per pack: another free pack still has its own downloads", async () => {
    expect(await getFreeDownloadQuota(stranger.id, free2.id)).toEqual({ left: 2, total: 2 });
    expectFileOf(await asUser(stranger.id, free2.id), free2);
  });

  it("three clicks at the same moment cannot take more than the quota", async () => {
    const clicker = await createUser(tag, "clicker");
    const claimsBefore = (await db().product.findUniqueOrThrow({ where: { id: free.id } })).claimCount;
    const results = await Promise.all([
      asUser(clicker.id, free.id),
      asUser(clicker.id, free.id),
      asUser(clicker.id, free.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(FREE_DOWNLOADS_PER_PACK);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "quotaExhausted" }]);
    expect(results.filter((r) => r.ok && r.claimed)).toHaveLength(1);
    expect(await db().downloadLog.count({ where: { productId: free.id, userId: clicker.id } })).toBe(
      FREE_DOWNLOADS_PER_PACK,
    );
    expect((await db().product.findUniqueOrThrow({ where: { id: free.id } })).claimCount).toBe(claimsBefore + 1);
  });

  it("the Free branch never hands out a Premium file", async () => {
    const tester = await createUser(tag, "tester");
    for (const fileId of [premium.fileId, otherPremium.fileId]) {
      expectBlocked(await asUser(tester.id, free.id, fileId), "notFound");
      expectBlocked(await asUser(buyer.id, free.id, fileId), "notFound");
    }
    // Refused attempts do not use up the free downloads.
    expect(await getFreeDownloadQuota(tester.id, free.id)).toEqual({ left: 2, total: 2 });
    // The only logged downloads of Premium files are the owner's own (Premium tests above).
    const logs = await db().downloadLog.findMany({
      where: { fileId: { in: [premium.fileId, otherPremium.fileId] } },
      select: { userId: true },
    });
    expect(logs.every((l) => l.userId === buyer.id)).toBe(true);
  });

  it("a hidden or draft free pack is not downloadable by anyone", async () => {
    const tester = await createUser(tag, "hidden");
    for (const status of ["HIDDEN", "DRAFT"] as const) {
      await setStatus(free2.id, status);
      expectBlocked(await asGuest(free2.id), "notFound");
      expectBlocked(await asUser(tester.id, free2.id), "notFound");
    }
    await setStatus(free2.id, "PUBLISHED");
    expect(await getFreeDownloadQuota(tester.id, free2.id)).toEqual({ left: 2, total: 2 });
  });
});

describe("Anti-bot cap", () => {
  it(`${DOWNLOAD_HOURLY_CAP} downloads an hour per account stops even a Premium owner; older downloads do not count`, async () => {
    const bot = await createUser(tag, "bot");
    const license = await db().license.findUniqueOrThrow({ where: { code: "PREMIUM" }, select: { id: true } });
    await db().entitlement.create({
      data: { userId: bot.id, productId: otherPremium.id, licenseId: license.id, source: "ADMIN_GRANT" },
    });
    const row = (createdAt: Date) => ({
      userId: bot.id,
      productId: otherPremium.id,
      fileId: otherPremium.fileId,
      createdAt,
    });
    const recent = new Date(Date.now() - 10 * 60_000);
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await db().downloadLog.createMany({ data: Array.from({ length: DOWNLOAD_HOURLY_CAP - 1 }, () => row(recent)) });
    await db().downloadLog.createMany({ data: Array.from({ length: 50 }, () => row(old)) });

    expectFileOf(await asUser(bot.id, otherPremium.id), otherPremium); // the 100th in the hour
    expectBlocked(await asUser(bot.id, otherPremium.id), "rateLimited");
  });
});

describe("Unknown ids", () => {
  it("an unknown pack id is simply not found", async () => {
    expectBlocked(await asGuest(`missing-${tag}`), "notFound");
    expectBlocked(await asUser(buyer.id, `missing-${tag}`), "notFound");
  });
});

describe("Buying more downloads of a free pack (§5, step 4.6)", () => {
  it("nothing is added until the verified payment; then +2 downloads, once, even if the webhook repeats", async () => {
    const buyer2 = await createUser(tag, "extra");
    await asUser(buyer2.id, free.id);
    await asUser(buyer2.id, free.id);
    expectBlocked(await asUser(buyer2.id, free.id), "quotaExhausted");

    const order = await placeExtraDownloads(buyer2.id, free.id);
    if (!order.ok) throw new Error(order.reason);
    expect(order.totalVnd).toBe(DEFAULT_EXTRA_DOWNLOADS.priceVnd);
    expect(order.items).toEqual([{ kind: "EXTRA_DOWNLOADS", extraDownloads: DEFAULT_EXTRA_DOWNLOADS.count }]);
    // Pending: still no downloads.
    expectBlocked(await asUser(buyer2.id, free.id), "quotaExhausted");
    // Underpaid: refused.
    const base = { txnId: order.txnId, orderCode: order.code, amountVnd: order.totalVnd, status: "SUCCEEDED" as const };
    expect(await sendWebhook({ ...base, eventId: eventId(tag), amountVnd: order.totalVnd - 1 })).toEqual({
      status: 400,
      result: "amountMismatch",
    });
    expectBlocked(await asUser(buyer2.id, free.id), "quotaExhausted");

    const salesBefore = (await db().product.findUniqueOrThrow({ where: { id: free.id } })).salesCount;
    const event = { ...base, eventId: eventId(tag) };
    const results = await Promise.all([sendWebhook(event), sendWebhook(event)]);
    expect(results.map((r) => r.result).sort()).toEqual(["duplicate", "processed"]);
    expect(await getFreeDownloadQuota(buyer2.id, free.id)).toEqual({ left: 2, total: 4 });
    // A download order is not a pack sale and creates no second entitlement.
    expect((await db().product.findUniqueOrThrow({ where: { id: free.id } })).salesCount).toBe(salesBefore);
    expect((await entitlementOf(buyer2.id, free.id))?.source).toBe("FREE_CLAIM");

    const third = await asUser(buyer2.id, free.id);
    expectFileOf(third, free);
    expect(third.ok && third.remaining).toBe(1);
    expectFileOf(await asUser(buyer2.id, free.id), free);
    expectBlocked(await asUser(buyer2.id, free.id), "quotaExhausted");
  });

  it("a failed payment adds nothing; downloads bought for one pack do not open another", async () => {
    const buyer3 = await createUser(tag, "extra-fail");
    const order = await placeExtraDownloads(buyer3.id, free2.id);
    if (!order.ok) throw new Error(order.reason);
    await sendWebhook({
      eventId: eventId(tag),
      txnId: order.txnId,
      orderCode: order.code,
      amountVnd: order.totalVnd,
      status: "FAILED",
    });
    expect(await getFreeDownloadQuota(buyer3.id, free2.id)).toEqual({ left: 2, total: 2 });
    expect(await db().downloadCredit.count({ where: { userId: buyer3.id } })).toBe(0);
  });

  it("cannot be bought for a Premium pack, a hidden pack or an unknown id", async () => {
    expect(await placeExtraDownloads(buyer.id, otherPremium.id)).toEqual({ ok: false, reason: "notFree" });
    await setStatus(free2.id, "HIDDEN");
    expect(await placeExtraDownloads(buyer.id, free2.id)).toEqual({ ok: false, reason: "notFound" });
    await setStatus(free2.id, "PUBLISHED");
    expect(await placeExtraDownloads(buyer.id, `missing-${tag}`)).toEqual({ ok: false, reason: "notFound" });
  });
});
