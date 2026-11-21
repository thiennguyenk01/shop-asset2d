import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ORDER_EXPIRE_GRACE_MINUTES } from "@backend/lib/cron/rules";
import { createRawSignature, momoOrderId, momoSign, resultRawSignature, type MomoResultFields } from "@backend/lib/payment/momo";
import { ACKNOWLEDGED, type PaymentProviderAdapter } from "@backend/modules/payment/providers";
import { createMomoProvider, PaymentUnavailableError } from "@backend/modules/payment/providers/momo";
import { addToCart } from "@backend/modules/cart/service";
import { reconcileOrders } from "@backend/modules/maintenance/service";
import { getOrderForUser, placeOrder } from "@backend/modules/order/service";
import { applyPaymentEvent } from "@backend/modules/payment/service";
import { cleanup, createPack, createUser, db, newTag, placePendingOrder } from "./fixtures";

/**
 * MoMo wallet (step 6.4) against the dev database, with MoMo itself replaced by a fake `fetch` (no network):
 * starting a payment, the signed IPN settling an order (and only a correctly signed one), and the reconcile job
 * asking MoMo before it lets an order expire.
 */
const tag = newTag();

/** The reconcile test swaps the active gateway for the fake MoMo; everything else uses the configured one (Demo). */
const mocked = vi.hoisted(() => ({ active: undefined as PaymentProviderAdapter | undefined }));
vi.mock("@backend/modules/payment/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@backend/modules/payment/providers")>();
  return { ...real, getActiveProvider: () => mocked.active ?? real.getActiveProvider() };
});
const config = { endpoint: "https://test-payment.momo.vn", partnerCode: "MOMOIT", accessKey: "it-access", secretKey: "it-secret" };
const ORIGIN = "https://abc-def.trycloudflare.com";

type Call = { url: string; body: Record<string, unknown> };
/** A fake MoMo: records each request, answers with `reply(path, body)`. */
function fakeMomo(reply: (path: string, body: Record<string, unknown>) => unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    const answer = reply(new URL(url).pathname, body);
    if (answer instanceof Error) throw answer;
    return Response.json(answer);
  }) as typeof fetch;
  const provider = createMomoProvider(config, { fetch: fetchImpl, describe: async (code) => `Pay ${code}` });
  return { provider, calls };
}

/** An IPN exactly as MoMo signs it (`secret` lets a test sign with the wrong key). */
function ipn(fields: Partial<MomoResultFields> & { orderId: string; amount: string }, secret = config.secretKey) {
  const f: MomoResultFields = {
    extraData: "",
    message: "Successful.",
    orderInfo: "Pay",
    orderType: "momo_wallet",
    partnerCode: config.partnerCode,
    payType: "qr",
    requestId: "req-it",
    responseTime: "1763600000000",
    resultCode: "0",
    transId: String(4_000_000_000 + Math.floor(Math.random() * 1e6)),
    ...fields,
  };
  const signature = momoSign(resultRawSignature(config.accessKey, f), secret);
  // MoMo sends numbers as JSON numbers.
  const body = { ...f, amount: Number(f.amount), resultCode: Number(f.resultCode), transId: Number(f.transId), responseTime: Number(f.responseTime), signature };
  return new Request(`${ORIGIN}/api/payments/momo/webhook`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

let buyer: { id: string };
let pack: Awaited<ReturnType<typeof createPack>>;
/** A pending order paid through MoMo (placed with the Demo gateway, then its payment is made a MoMo payment). */
async function momoOrder(userId: string, priceVnd: number) {
  const placed = await placePendingOrder(userId, pack.id, priceVnd);
  const txn = momoOrderId(placed.code, randomBytes(5));
  // One pending payment per order (constraint Payment_one_pending_per_order): turn the Demo payment into a MoMo one.
  const { count } = await db().payment.updateMany({ where: { orderId: placed.orderId, status: "PENDING" }, data: { provider: "MOMO", providerTxnId: txn } });
  expect(count).toBe(1);
  return { ...placed, txn };
}
const statusOf = async (orderId: string) => (await db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })).status;

beforeAll(async () => {
  buyer = await createUser(tag, "momo");
  pack = await createPack(tag, "momo", { type: "PREMIUM", priceVnd: 150_000 });
});

afterAll(async () => {
  const orders = await db().order.findMany({ where: { user: { email: { startsWith: `it-${tag}-` } } }, select: { code: true } });
  for (const { code } of orders) await db().webhookEvent.deleteMany({ where: { provider: "MOMO", eventId: { startsWith: `momo:${code}-` } } });
  await cleanup(tag);
});

describe("MoMo: starting a payment", () => {
  it("sends a signed captureWallet request and returns MoMo's payment page", async () => {
    const payUrl = "https://test-payment.momo.vn/v2/gateway/pay?t=it";
    const { provider, calls } = fakeMomo(() => ({ resultCode: 0, message: "Successful.", payUrl }));
    const created = await provider.createPayment({ code: "AG-20261120-7F3KQ2", totalVnd: 150_000, locale: "zh", origin: ORIGIN });
    expect(created).toMatchObject({ redirectTo: payUrl, resumeUrl: payUrl });
    expect(created.providerTxnId).toMatch(/^AG-20261120-7F3KQ2-[0-9a-f]{10}$/);

    expect(calls).toHaveLength(1);
    const { url, body } = calls[0];
    expect(url).toBe("https://test-payment.momo.vn/v2/gateway/api/create");
    expect(body).toMatchObject({
      partnerCode: "MOMOIT",
      amount: 150_000,
      orderId: created.providerTxnId,
      orderInfo: "Pay AG-20261120-7F3KQ2",
      ipnUrl: `${ORIGIN}/api/payments/momo/webhook`,
      redirectUrl: `${ORIGIN}/zh/checkout/result/AG-20261120-7F3KQ2`,
      requestType: "captureWallet",
      extraData: "",
      lang: "en",
    });
    expect(body).not.toHaveProperty("secretKey");
    expect(body.signature).toBe(momoSign(createRawSignature(config, body as never), config.secretKey));
  });

  it("refuses when MoMo says no, answers nonsense, sends elsewhere or cannot be reached", async () => {
    const order = { code: "AG-20261120-7F3KQ2", totalVnd: 150_000, locale: "vi", origin: ORIGIN };
    for (const answer of [
      { resultCode: 22, message: "Amount out of range" },
      { resultCode: 0 },
      { resultCode: 0, payUrl: "https://evil.test/pay" },
      { nonsense: true },
      new Error("network down"),
    ]) {
      const { provider } = fakeMomo(() => answer);
      await expect(provider.createPayment(order)).rejects.toBeInstanceOf(PaymentUnavailableError);
    }
  });
});

describe("MoMo: the IPN settles the order (only when correctly signed)", () => {
  it("pays the order once; forged, foreign, unfinished and wrong-amount notifications change nothing", async () => {
    const { provider } = fakeMomo(() => ({}));
    const o = await momoOrder(buyer.id, 150_000);

    // Not authentic: wrong key, another partner, broken body.
    expect(await provider.verifyWebhook(ipn({ orderId: o.txn, amount: "150000" }, "wrong-secret"))).toBeNull();
    expect(await provider.verifyWebhook(ipn({ orderId: o.txn, amount: "150000", partnerCode: "OTHER" }))).toBeNull();
    expect(await provider.verifyWebhook(new Request(ORIGIN, { method: "POST", body: "{not json" }))).toBeNull();
    // A signed body whose amount was changed afterwards.
    const tampered = JSON.parse(await ipn({ orderId: o.txn, amount: "150000" }).text());
    expect(await provider.verifyWebhook(new Request(ORIGIN, { method: "POST", body: JSON.stringify({ ...tampered, amount: 1_000 }) }))).toBeNull();

    // Still waiting for the customer: acknowledged, nothing to settle.
    expect(await provider.verifyWebhook(ipn({ orderId: o.txn, amount: "150000", resultCode: "1000" }))).toBe(ACKNOWLEDGED);
    expect(await statusOf(o.orderId)).toBe("PENDING");

    // Paid.
    const paid = ipn({ orderId: o.txn, amount: "150000", transId: "4100000001" });
    const again = paid.clone();
    const event = await provider.verifyWebhook(paid);
    expect(event).toMatchObject({ providerTxnId: o.txn, orderCode: o.code, amountVnd: 150_000, status: "SUCCEEDED" });
    expect(await applyPaymentEvent("MOMO", event as Exclude<typeof event, null | typeof ACKNOWLEDGED>)).toEqual({ result: "processed", orderCode: o.code });
    expect(await statusOf(o.orderId)).toBe("PAID");
    expect(await db().entitlement.count({ where: { userId: buyer.id, productId: pack.id, revokedAt: null } })).toBe(1);

    // MoMo sends the same notification again: a duplicate, nothing changes.
    const replay = await provider.verifyWebhook(again);
    expect(await applyPaymentEvent("MOMO", replay as Exclude<typeof replay, null | typeof ACKNOWLEDGED>)).toEqual({ result: "duplicate", orderCode: o.code });
  });

  it("a signed notification for another amount is rejected; a cancelled payment cancels the order", async () => {
    const buyer2 = await createUser(tag, "momo2");
    const { provider } = fakeMomo(() => ({}));
    const o = await momoOrder(buyer2.id, 150_000);
    const wrong = await provider.verifyWebhook(ipn({ orderId: o.txn, amount: "1000" }));
    expect(await applyPaymentEvent("MOMO", wrong as Exclude<typeof wrong, null | typeof ACKNOWLEDGED>)).toEqual({ result: "rejected", reason: "amountMismatch" });
    expect(await statusOf(o.orderId)).toBe("PENDING");

    const cancelled = await provider.verifyWebhook(ipn({ orderId: o.txn, amount: "150000", resultCode: "1006", message: "Denied" }));
    expect(cancelled).toMatchObject({ status: "CANCELLED" });
    await applyPaymentEvent("MOMO", cancelled as Exclude<typeof cancelled, null | typeof ACKNOWLEDGED>);
    expect(await statusOf(o.orderId)).toBe("CANCELLED");
    expect(await db().entitlement.count({ where: { userId: buyer2.id } })).toBe(0);
  });
});

describe("reconcile asks MoMo before an order expires", () => {
  afterAll(() => {
    mocked.active = undefined;
  });

  it("expires only what MoMo says is over; keeps what may still be paid or could not be checked", async () => {
    const answers = new Map<string, number | Error>();
    const { provider, calls } = fakeMomo((path, body) => {
      expect(path).toBe("/v2/gateway/api/query");
      const a = answers.get(String(body.orderId));
      return a instanceof Error ? a : { orderId: body.orderId, resultCode: a ?? 42 };
    });

    const cases = { waiting: 1000, paidNoIpn: 0, denied: 1006, expiredLink: 1005, unreachable: new Error("timeout") } as const;
    const orders: Record<string, Awaited<ReturnType<typeof momoOrder>>> = {};
    for (const name of Object.keys(cases)) {
      const u = await createUser(tag, `rec-${name}`);
      orders[name] = await momoOrder(u.id, 150_000);
      answers.set(orders[name].txn, cases[name as keyof typeof cases]);
      await db().order.update({ where: { id: orders[name].orderId }, data: { expiresAt: new Date(Date.now() - (ORDER_EXPIRE_GRACE_MINUTES + 5) * 60_000) } });
    }
    // An overdue order paid through another gateway (Demo) cannot be asked: it expires as before.
    const uDemo = await createUser(tag, "rec-demo");
    const demo = await placePendingOrder(uDemo.id, pack.id, 150_000);
    await db().order.update({ where: { id: demo.orderId }, data: { expiresAt: new Date(Date.now() - (ORDER_EXPIRE_GRACE_MINUTES + 5) * 60_000) } });

    // The orders exist (placed with the Demo gateway); from here on MoMo is the active gateway.
    mocked.active = provider;
    const report = await reconcileOrders();
    expect(report.waitingOrders).toBeGreaterThanOrEqual(3);
    expect(await statusOf(orders.waiting.orderId)).toBe("PENDING");
    expect(await statusOf(orders.paidNoIpn.orderId)).toBe("PENDING"); // never granted by the job
    expect(await statusOf(orders.unreachable.orderId)).toBe("PENDING");
    expect(await statusOf(orders.denied.orderId)).toBe("EXPIRED");
    expect(await statusOf(orders.expiredLink.orderId)).toBe("EXPIRED");
    expect(await statusOf(demo.orderId)).toBe("EXPIRED");
    expect(await db().entitlement.count({ where: { user: { email: { startsWith: `it-${tag}-rec-` } } } })).toBe(0);

    // Each query is signed for that order.
    const q = calls.find((c) => c.body.orderId === orders.waiting.txn)!;
    expect(q.body.signature).toBe(momoSign(`accessKey=${config.accessKey}&orderId=${orders.waiting.txn}&partnerCode=${config.partnerCode}&requestId=${q.body.requestId}`, config.secretKey));
  });
});

describe("checkout with MoMo as the active gateway", () => {
  afterAll(() => {
    mocked.active = undefined;
  });

  it("an order goes to MoMo's page, is marked as a test order and can be resumed", async () => {
    const payUrl = "https://test-payment.momo.vn/v2/gateway/pay?t=resume";
    const { provider } = fakeMomo(() => ({ resultCode: 0, payUrl }));
    mocked.active = provider;
    const u = await createUser(tag, "co-ok");
    await addToCart({ kind: "user", userId: u.id }, pack.id);
    const placed = await placeOrder({ userId: u.id, locale: "vi", couponCode: null, expectedTotalVnd: 150_000, origin: ORIGIN });
    expect(placed).toMatchObject({ ok: true, redirectTo: payUrl });

    const order = await db().order.findFirstOrThrow({
      where: { userId: u.id },
      select: { code: true, isDemo: true, payments: { select: { provider: true, status: true } } },
    });
    expect(order.isDemo).toBe(true); // MoMo test environment: no real money
    expect(order.payments).toEqual([{ provider: "MOMO", status: "PENDING" }]);
    const view = await getOrderForUser(order.code, u.id, "vi");
    expect(view?.payment).toMatchObject({ provider: "MOMO", status: "PENDING", resumeUrl: payUrl });
    expect(view?.payment).not.toHaveProperty("rawPayload");
  });

  it("when MoMo does not start the payment, the order is FAILED and the cart is kept", async () => {
    const { provider } = fakeMomo(() => ({ resultCode: 99, message: "Unknown error" }));
    mocked.active = provider;
    const u = await createUser(tag, "co-fail");
    await addToCart({ kind: "user", userId: u.id }, pack.id);
    expect(await placeOrder({ userId: u.id, locale: "en", couponCode: null, expectedTotalVnd: 150_000, origin: ORIGIN })).toEqual({
      ok: false,
      reason: "paymentUnavailable",
    });
    const orders = await db().order.findMany({ where: { userId: u.id }, select: { status: true, payments: { select: { id: true } } } });
    expect(orders).toEqual([{ status: "FAILED", payments: [] }]);
    expect(await db().cartItem.count({ where: { cart: { userId: u.id }, productId: pack.id } })).toBe(1);
  });

  it("a total MoMo does not take (under 1.000 ₫) is refused before any order exists", async () => {
    const { provider, calls } = fakeMomo(() => ({ resultCode: 0, payUrl: "https://test-payment.momo.vn/pay" }));
    mocked.active = provider;
    const cheap = await createPack(tag, "cheap", { type: "PREMIUM", priceVnd: 500 });
    const u = await createUser(tag, "co-cheap");
    await addToCart({ kind: "user", userId: u.id }, cheap.id);
    expect(await placeOrder({ userId: u.id, locale: "vi", couponCode: null, expectedTotalVnd: 500, origin: ORIGIN })).toEqual({
      ok: false,
      reason: "amountNotSupported",
    });
    expect(await db().order.count({ where: { userId: u.id } })).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
