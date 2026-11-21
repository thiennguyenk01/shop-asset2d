import { describe, expect, it } from "vitest";
import { checkPaymentEvent } from "@backend/lib/payment/rules";
import {
  orderCodeFromMemo,
  sameBankAccount,
  sepayQrImageUrl,
  sepaySignature,
  sepayTransferTime,
  sepayWebhookSchema,
  transferCodeOf,
  verifySepaySignature,
} from "@backend/lib/payment/sepay";
import { parseEnv } from "@backend/env";

const SECRET = "sepay-unit-secret-1234567890";
const NOW = 1_763_600_000_000; // ms
const TS = String(NOW / 1000);
const BODY = '{"id":92704,"content":"AG202611207F3KQ2 thanh toan","transferAmount":150000}';

describe("SePay signature (HMAC-SHA256 over `<timestamp>.<raw body>`)", () => {
  it("matches SePay's reference formula: sha256= + lowercase hex", () => {
    const sig = sepaySignature(TS, BODY, SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySepaySignature({ rawBody: BODY, signature: sig, timestamp: TS, secret: SECRET, nowMs: NOW })).toBe(true);
  });

  it("refuses a changed body, timestamp, secret, or a missing header", () => {
    const sig = sepaySignature(TS, BODY, SECRET);
    const ok = { rawBody: BODY, signature: sig, timestamp: TS, secret: SECRET, nowMs: NOW };
    expect(verifySepaySignature({ ...ok, rawBody: BODY.replace("150000", "1500000") })).toBe(false);
    expect(verifySepaySignature({ ...ok, timestamp: String(Number(TS) + 1) })).toBe(false);
    expect(verifySepaySignature({ ...ok, secret: SECRET + "x" })).toBe(false);
    expect(verifySepaySignature({ ...ok, signature: null })).toBe(false);
    expect(verifySepaySignature({ ...ok, timestamp: null })).toBe(false);
    expect(verifySepaySignature({ ...ok, timestamp: "12a" })).toBe(false);
    // The body alone is not what SePay signs.
    expect(verifySepaySignature({ ...ok, signature: sepaySignature("", BODY, SECRET) })).toBe(false);
  });

  it("refuses a request signed more than 5 minutes away from now (replay)", () => {
    const old = String(NOW / 1000 - 301);
    const sig = sepaySignature(old, BODY, SECRET);
    expect(verifySepaySignature({ rawBody: BODY, signature: sig, timestamp: old, secret: SECRET, nowMs: NOW })).toBe(false);
    const recent = String(NOW / 1000 - 299);
    expect(verifySepaySignature({ rawBody: BODY, signature: sepaySignature(recent, BODY, SECRET), timestamp: recent, secret: SECRET, nowMs: NOW })).toBe(true);
  });
});

describe("transfer memo ↔ order code", () => {
  it("the memo is the order code without dashes", () => {
    expect(transferCodeOf("AG-20261120-7F3KQ2")).toBe("AG202611207F3KQ2");
  });

  it("finds the order code however the bank wrote the memo", () => {
    for (const memo of [
      "AG202611207F3KQ2",
      "ag202611207f3kq2 thanh toan",
      "MBVCB.1234.AG-20261120-7F3KQ2.CT tu 0123",
      "NGUYEN VAN A chuyen tien AG 20261120 7F3KQ2",
      "123456AG202611207F3KQ2-GD 998877",
    ]) {
      expect(orderCodeFromMemo(memo), memo).toBe("AG-20261120-7F3KQ2");
    }
  });

  it("uses SePay's detected code too, and agrees when both name the same order", () => {
    expect(orderCodeFromMemo("AG202611207F3KQ2", "chuyen tien")).toBe("AG-20261120-7F3KQ2");
    expect(orderCodeFromMemo("AG202611207F3KQ2", "AG202611207F3KQ2 tt")).toBe("AG-20261120-7F3KQ2");
  });

  it("no code, a malformed code, or two different codes → null (an Admin decides)", () => {
    expect(orderCodeFromMemo("chuyen tien mua asset")).toBeNull();
    expect(orderCodeFromMemo(null, undefined, "")).toBeNull();
    expect(orderCodeFromMemo("AG2026112O7F3KQ2")).toBeNull(); // letter O in the date
    expect(orderCodeFromMemo("AG20261120-7F3KQ")).toBeNull(); // 5 characters
    expect(orderCodeFromMemo("AG202611207F3KQ2 va AG202611209ZZZZZ")).toBeNull();
  });
});

describe("SePay payload and helpers", () => {
  const payload = {
    id: 92704,
    gateway: "MBBank",
    transactionDate: "2026-11-20 14:02:37",
    accountNumber: "0123499999",
    code: null,
    content: "AG202611207F3KQ2",
    transferType: "in",
    transferAmount: 150000,
    accumulated: 19077000,
    subAccount: null,
    referenceCode: "SB.3278907687",
    description: "",
  };

  it("parses SePay's documented payload; refuses unknown transfer types and fractional amounts", () => {
    expect(sepayWebhookSchema.safeParse(payload).success).toBe(true);
    expect(sepayWebhookSchema.safeParse({ ...payload, transferType: "both" }).success).toBe(false);
    expect(sepayWebhookSchema.safeParse({ ...payload, transferAmount: 1.5 }).success).toBe(false);
  });

  it("reads SePay's time as Vietnam time", () => {
    expect(sepayTransferTime("2026-11-20 14:02:37")?.toISOString()).toBe("2026-11-20T07:02:37.000Z");
    expect(sepayTransferTime("20/11/2026")).toBeNull();
  });

  it("compares account numbers without spaces", () => {
    expect(sameBankAccount("0123 4999 99", "0123499999")).toBe(true);
    expect(sameBankAccount("0123499998", "0123499999")).toBe(false);
    expect(sameBankAccount("", "")).toBe(false);
  });

  it("builds the VietQR image link with the exact amount and memo", () => {
    const url = new URL(sepayQrImageUrl({ account: "0123499999", bank: "MBBank", amountVnd: 150000, memo: "AG202611207F3KQ2" }));
    expect(url.origin).toBe("https://vietqr.app");
    expect(Object.fromEntries(url.searchParams)).toEqual({ acc: "0123499999", bank: "MBBank", amount: "150000", des: "AG202611207F3KQ2" });
  });
});

describe("late bank transfer (user choice 2026-11-20)", () => {
  const order = { code: "AG-20261120-7F3KQ2", status: "EXPIRED" as const, totalVnd: 150_000 };
  const payment = { status: "PENDING" as const, amountVnd: 150_000 };
  const event = { orderCode: order.code, amountVnd: 150_000, status: "SUCCEEDED" as const };

  it("an exact transfer still settles an EXPIRED order — only for bank transfers", () => {
    expect(checkPaymentEvent({ order, payment, event, acceptExpired: true })).toEqual({ kind: "apply", status: "SUCCEEDED" });
    expect(checkPaymentEvent({ order, payment, event })).toEqual({ kind: "ignore" });
  });

  it("never a cancelled, failed, paid or refunded order, nor a wrong amount", () => {
    for (const status of ["CANCELLED", "FAILED", "PAID", "REFUNDED"] as const) {
      expect(checkPaymentEvent({ order: { ...order, status }, payment, event, acceptExpired: true })).toEqual({ kind: "ignore" });
    }
    expect(checkPaymentEvent({ order, payment, event: { ...event, amountVnd: 149_000 }, acceptExpired: true })).toEqual({
      kind: "reject",
      reason: "amountMismatch",
    });
  });
});

describe("SePay configuration", () => {
  const sepay = { PAYMENT_PROVIDER: "sepay", SEPAY_WEBHOOK_SECRET: "s".repeat(24), SEPAY_BANK_ACCOUNT: "0123499999", SEPAY_BANK_NAME: "MBBank" };
  const prod = {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://u:p@ep-x-pooler.region.aws.neon.tech/db",
    AUTH_SECRET: "x".repeat(32),
    STORAGE_DRIVER: "r2",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    R2_PUBLIC_BUCKET: "pub",
    R2_PRIVATE_BUCKET: "priv",
    R2_PUBLIC_BASE_URL: "https://media.example.com",
    MAIL_DRIVER: "resend",
    MAIL_FROM: "Shop <no-reply@shop.example.com>",
    RESEND_API_KEY: "re_test_key",
    CRON_SECRET: "c".repeat(32),
  };

  it("needs the webhook secret, the account and the bank; Test mode by default", () => {
    expect(parseEnv(sepay).SEPAY_MODE).toBe("test");
    expect(() => parseEnv({ ...sepay, SEPAY_WEBHOOK_SECRET: "" })).toThrow(/SEPAY_WEBHOOK_SECRET/);
    expect(() => parseEnv({ ...sepay, SEPAY_WEBHOOK_SECRET: "short" })).toThrow(/SEPAY_WEBHOOK_SECRET/);
    expect(() => parseEnv({ ...sepay, SEPAY_BANK_ACCOUNT: "" })).toThrow(/SEPAY_BANK_ACCOUNT/);
    expect(() => parseEnv({ ...sepay, SEPAY_BANK_ACCOUNT: "0123-4999" })).toThrow(/SEPAY_BANK_ACCOUNT/);
    expect(() => parseEnv({ ...sepay, SEPAY_BANK_NAME: "" })).toThrow(/SEPAY_BANK_NAME/);
    expect(() => parseEnv({ ...sepay, SEPAY_MODE: "sandbox" })).toThrow();
  });

  it("production refuses SePay Test mode", () => {
    expect(() => parseEnv({ ...prod, ...sepay })).toThrow(/SEPAY_MODE/);
    expect(() => parseEnv({ ...prod, ...sepay, SEPAY_MODE: "live" })).not.toThrow();
  });
});
