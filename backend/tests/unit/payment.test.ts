import { describe, expect, it } from "vitest";
import { checkPaymentEvent, effectiveOrderStatus, makeOrderCode, ORDER_CODE_RE, orderStatusAfter } from "@backend/lib/payment/rules";
import { signDemoWebhook, verifyDemoWebhook } from "@backend/modules/payment/providers/demo-signature";

const SECRET = "test-secret-that-is-long-enough-123456";

describe("order code", () => {
  it("is readable, dated and free of ambiguous characters", () => {
    const code = makeOrderCode(new Date("2026-11-14T08:00:00Z"), new Uint8Array([0, 1, 2, 3, 30, 255]));
    expect(code).toMatch(ORDER_CODE_RE);
    expect(code.startsWith("AG-20261114-")).toBe(true);
    for (let i = 0; i < 200; i++) {
      const random = crypto.getRandomValues(new Uint8Array(6));
      const generated = makeOrderCode(new Date(), random);
      expect(generated).toMatch(ORDER_CODE_RE);
      expect(generated.slice(-6)).not.toMatch(/[01IOL]/);
    }
  });
});

const order = { code: "AG-20261114-ABCDEF", status: "PENDING" as const, totalVnd: 1_341_000 };
const payment = { status: "PENDING" as const, amountVnd: 1_341_000 };
const event = { orderCode: order.code, amountVnd: 1_341_000, status: "SUCCEEDED" as const };

describe("checkPaymentEvent (CLAUDE.md §6 step 4)", () => {
  it("applies a matching event to a pending order", () => {
    expect(checkPaymentEvent({ order, payment, event })).toEqual({ kind: "apply", status: "SUCCEEDED" });
    expect(checkPaymentEvent({ order, payment, event: { ...event, status: "FAILED" } })).toEqual({ kind: "apply", status: "FAILED" });
  });

  it("rejects another order or a wrong amount (never grants on a short payment)", () => {
    expect(checkPaymentEvent({ order, payment, event: { ...event, orderCode: "AG-20261114-ZZZZZZ" } })).toEqual({ kind: "reject", reason: "orderMismatch" });
    for (const amountVnd of [1, 1_340_999, 1_341_001, 0, -1, 1.5, Number.NaN]) {
      expect(checkPaymentEvent({ order, payment, event: { ...event, amountVnd } })).toEqual({ kind: "reject", reason: "amountMismatch" });
    }
    expect(checkPaymentEvent({ order, payment: { ...payment, amountVnd: 1 }, event })).toEqual({ kind: "reject", reason: "amountMismatch" });
  });

  it("ignores events for anything already settled (replays, late or out-of-order events)", () => {
    for (const status of ["PAID", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"] as const) {
      expect(checkPaymentEvent({ order: { ...order, status }, payment, event })).toEqual({ kind: "ignore" });
    }
    for (const status of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      expect(checkPaymentEvent({ order, payment: { ...payment, status }, event })).toEqual({ kind: "ignore" });
    }
  });

  it("maps payment outcomes to order states", () => {
    expect(orderStatusAfter("SUCCEEDED")).toBe("PAID");
    expect(orderStatusAfter("FAILED")).toBe("FAILED");
    expect(orderStatusAfter("CANCELLED")).toBe("CANCELLED");
  });

  it("a pending order past its expiry reads as EXPIRED", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    expect(effectiveOrderStatus({ status: "PENDING", expiresAt: new Date("2026-11-14T09:59:59Z") }, now)).toBe("EXPIRED");
    expect(effectiveOrderStatus({ status: "PENDING", expiresAt: new Date("2026-11-14T10:00:01Z") }, now)).toBe("PENDING");
    expect(effectiveOrderStatus({ status: "PAID", expiresAt: new Date("2026-11-14T09:00:00Z") }, now)).toBe("PAID");
  });
});

describe("demo webhook signature", () => {
  const body = JSON.stringify({ eventId: "evt_abcdefgh", txnId: "demo_abcdefghijklmnop", orderCode: order.code, amountVnd: 1, status: "SUCCEEDED" });

  it("accepts its own fresh signature", () => {
    const now = Date.now();
    expect(verifyDemoWebhook(body, signDemoWebhook(body, SECRET, now), SECRET, now + 1000)).toBe(true);
  });

  it("refuses a changed body, another secret, a stale timestamp and junk headers", () => {
    const now = Date.now();
    const header = signDemoWebhook(body, SECRET, now);
    expect(verifyDemoWebhook(body.replace('"amountVnd":1', '"amountVnd":2'), header, SECRET, now)).toBe(false);
    expect(verifyDemoWebhook(body, header, "another-secret-that-is-long-enough", now)).toBe(false);
    expect(verifyDemoWebhook(body, header, SECRET, now + 6 * 60_000)).toBe(false);
    for (const bad of [null, "", "t=1", "v1=abc", "t=x,v1=" + "0".repeat(64), "t=1,v1=zz", "x".repeat(300)]) {
      expect(verifyDemoWebhook(body, bad, SECRET, now)).toBe(false);
    }
  });
});
