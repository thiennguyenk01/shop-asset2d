import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sepaySignature, transferCodeOf } from "@backend/lib/payment/sepay";
import type { PaymentProviderAdapter } from "@backend/modules/payment/providers";
import { createSepayProvider } from "@backend/modules/payment/providers/sepay";
import { handlePaymentWebhook } from "@backend/modules/payment/webhook";
import { cleanup, createPack, createUser, db, newTag, placePendingOrder } from "./fixtures";

/**
 * SePay bank transfers (user choice 2026-11-20) against the dev database, through the real webhook handler:
 * only a correctly signed, fresh notification settles an order; a late exact transfer still settles an EXPIRED
 * order; a transfer that settles nothing is kept as an UnmatchedTransfer (never granted) and acknowledged.
 */
const tag = newTag();

const mocked = vi.hoisted(() => ({ active: undefined as PaymentProviderAdapter | undefined }));
vi.mock("@backend/modules/payment/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@backend/modules/payment/providers")>();
  return { ...real, getActiveProvider: () => mocked.active ?? real.getActiveProvider() };
});

const SECRET = "it-sepay-webhook-secret-123456";
const ACCOUNT = "0123499999";
const ORIGIN = "https://abc-def.trycloudflare.com";
mocked.active = createSepayProvider({ webhookSecret: SECRET, bankAccount: ACCOUNT, bankName: "MBBank", testMode: true });

/** SePay transaction ids used by this run (high, random range; removed afterwards). */
const base = 2_000_000_000 + Math.floor(Math.random() * 1e8);
let seq = 0;
const ids: number[] = [];
function nextId() {
  const id = base + ++seq;
  ids.push(id);
  return id;
}

/** A notification exactly as SePay signs it; `opts` lets a test break the signature or the clock. */
function transfer(
  fields: { content: string; amount: number; id?: number; transferType?: "in" | "out"; accountNumber?: string },
  opts: { secret?: string; ageSeconds?: number } = {},
) {
  const body = JSON.stringify({
    id: fields.id ?? nextId(),
    gateway: "MBBank",
    transactionDate: "2026-11-20 14:02:37",
    accountNumber: fields.accountNumber ?? ACCOUNT,
    subAccount: null,
    code: null,
    content: fields.content,
    transferType: fields.transferType ?? "in",
    description: "",
    transferAmount: fields.amount,
    accumulated: 0,
    referenceCode: "SB.123",
  });
  const ts = String(Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0));
  return new Request(`${ORIGIN}/api/payments/sepay/webhook`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", "X-SePay-Timestamp": ts, "X-SePay-Signature": sepaySignature(ts, body, opts.secret ?? SECRET) },
  });
}

let buyer: { id: string };
let pack: Awaited<ReturnType<typeof createPack>>;
const orders: { orderId: string; code: string }[] = [];

/** A pending order paid by bank transfer (placed with the active gateway = the SePay test adapter). */
async function sepayOrder(label: string, priceVnd = 150_000) {
  const user = await createUser(tag, label);
  const placed = await placePendingOrder(user.id, pack.id, priceVnd);
  orders.push(placed);
  return { ...placed, userId: user.id, memo: transferCodeOf(placed.code) };
}
const orderOf = (orderId: string) =>
  db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, isDemo: true, payments: { select: { provider: true, providerTxnId: true, status: true } } } });
const ownsPack = async (userId: string) => (await db().entitlement.count({ where: { userId, productId: pack.id, revokedAt: null } })) === 1;
const unmatched = (id: number) => db().unmatchedTransfer.findUnique({ where: { provider_externalId: { provider: "SEPAY", externalId: String(id) } } });

async function send(req: Request) {
  const res = await handlePaymentWebhook("sepay", req);
  return { status: res.status, body: await res.json().catch(() => null) };
}
const OK = { status: 200, body: { success: true } };

beforeAll(async () => {
  buyer = await createUser(tag, "sepay");
  pack = await createPack(tag, "sepay", { type: "PREMIUM", priceVnd: 150_000 });
});

afterAll(async () => {
  mocked.active = undefined;
  await db().unmatchedTransfer.deleteMany({ where: { provider: "SEPAY", externalId: { in: ids.map(String) } } });
  await db().webhookEvent.deleteMany({ where: { provider: "SEPAY", eventId: { in: ids.map((id) => `sepay:${id}`) } } });
  await cleanup(tag);
  expect(await db().unmatchedTransfer.count({ where: { externalId: { in: ids.map(String) } } })).toBe(0);
});

describe("SePay bank transfer", () => {
  it("placing an order starts no remote payment: the transfer code is the payment id and the order is a test order", async () => {
    const o = await sepayOrder("start");
    const row = await orderOf(o.orderId);
    expect(row).toMatchObject({ status: "PENDING", isDemo: true, payments: [{ provider: "SEPAY", providerTxnId: o.memo, status: "PENDING" }] });
    expect(buyer.id).toBeTruthy();
  });

  it("a signed exact transfer naming the order settles it once; a replay changes nothing", async () => {
    const o = await sepayOrder("paid");
    const id = nextId();
    expect(await send(transfer({ id, content: `${o.memo} chuyen tien`, amount: 150_000 }))).toEqual(OK);
    expect((await orderOf(o.orderId)).status).toBe("PAID");
    expect(await ownsPack(o.userId)).toBe(true);
    // SePay retries / manual replay: same id → acknowledged, nothing new, nothing kept as unmatched.
    expect(await send(transfer({ id, content: `${o.memo} chuyen tien`, amount: 150_000 }))).toEqual(OK);
    expect(await unmatched(id)).toBeNull();
    expect(await db().webhookEvent.count({ where: { provider: "SEPAY", eventId: `sepay:${id}` } })).toBe(1);
  });

  it("refuses a wrong signature or a stale request (401) and changes nothing", async () => {
    const o = await sepayOrder("forged");
    const forged = await send(transfer({ content: o.memo, amount: 150_000 }, { secret: "not-the-secret-000000" }));
    expect(forged.status).toBe(401);
    const stale = await send(transfer({ content: o.memo, amount: 150_000 }, { ageSeconds: 600 }));
    expect(stale.status).toBe(401);
    expect((await orderOf(o.orderId)).status).toBe("PENDING");
    expect(await ownsPack(o.userId)).toBe(false);
  });

  it("an exact transfer arriving after the order EXPIRED still settles it", async () => {
    const o = await sepayOrder("late");
    await db().order.update({ where: { id: o.orderId }, data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 3_600_000) } });
    expect(await send(transfer({ content: o.memo, amount: 150_000 }))).toEqual(OK);
    expect((await orderOf(o.orderId)).status).toBe("PAID");
    expect(await ownsPack(o.userId)).toBe(true);
  });

  it("a wrong amount grants nothing and is kept for an Admin", async () => {
    const o = await sepayOrder("short");
    const id = nextId();
    expect(await send(transfer({ id, content: o.memo, amount: 149_000 }))).toEqual(OK);
    expect((await orderOf(o.orderId)).status).toBe("PENDING");
    expect(await ownsPack(o.userId)).toBe(false);
    expect(await unmatched(id)).toMatchObject({ reason: "AMOUNT_MISMATCH", amountVnd: 149_000, orderCode: o.code, bankAccount: ACCOUNT, resolvedAt: null });
    // Replayed: still one row.
    expect(await send(transfer({ id, content: o.memo, amount: 149_000 }))).toEqual(OK);
    expect(await db().unmatchedTransfer.count({ where: { provider: "SEPAY", externalId: String(id) } })).toBe(1);
  });

  it("a memo without an order code, or with an unknown one, is kept as NO_ORDER", async () => {
    const none = nextId();
    expect(await send(transfer({ id: none, content: "chuyen tien mua asset", amount: 150_000 }))).toEqual(OK);
    expect(await unmatched(none)).toMatchObject({ reason: "NO_ORDER", orderCode: null, content: "chuyen tien mua asset" });
    const unknown = nextId();
    expect(await send(transfer({ id: unknown, content: "AG202611209ZZZZZ", amount: 150_000 }))).toEqual(OK);
    expect(await unmatched(unknown)).toMatchObject({ reason: "NO_ORDER", orderCode: "AG-20261120-9ZZZZZ" });
  });

  it("a second transfer for a paid order, or any transfer for a cancelled one, is kept as ORDER_CLOSED", async () => {
    const paid = await sepayOrder("twice");
    expect(await send(transfer({ content: paid.memo, amount: 150_000 }))).toEqual(OK);
    const again = nextId();
    expect(await send(transfer({ id: again, content: paid.memo, amount: 150_000 }))).toEqual(OK);
    expect(await unmatched(again)).toMatchObject({ reason: "ORDER_CLOSED", orderCode: paid.code });

    const cancelled = await sepayOrder("cancelled");
    await db().order.update({ where: { id: cancelled.orderId }, data: { status: "CANCELLED" } });
    const id = nextId();
    expect(await send(transfer({ id, content: cancelled.memo, amount: 150_000 }))).toEqual(OK);
    expect((await orderOf(cancelled.orderId)).status).toBe("CANCELLED");
    expect(await ownsPack(cancelled.userId)).toBe(false);
    expect(await unmatched(id)).toMatchObject({ reason: "ORDER_CLOSED" });
  });

  it("money going out, or a transfer to another account, is acknowledged and ignored", async () => {
    const o = await sepayOrder("other");
    const out = nextId();
    expect(await send(transfer({ id: out, content: o.memo, amount: 150_000, transferType: "out" }))).toEqual(OK);
    const elsewhere = nextId();
    expect(await send(transfer({ id: elsewhere, content: o.memo, amount: 150_000, accountNumber: "9999999999" }))).toEqual(OK);
    expect((await orderOf(o.orderId)).status).toBe("PENDING");
    expect(await unmatched(out)).toBeNull();
    expect(await unmatched(elsewhere)).toBeNull();
  });

  it("the webhook of another gateway is refused while SePay is active", async () => {
    const res = await handlePaymentWebhook("momo", transfer({ content: "x", amount: 1_000 }));
    expect(res.status).toBe(404);
  });
});
