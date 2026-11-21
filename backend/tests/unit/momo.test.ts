import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicOrigin } from "@backend/lib/http/origin";
import {
  createRawSignature,
  isMomoPayUrl,
  MOMO_MAX_AMOUNT,
  MOMO_MIN_AMOUNT,
  momoAmountSupported,
  momoLang,
  momoOrderId,
  momoResultStatus,
  momoSign,
  orderCodeFromMomoOrderId,
  queryRawSignature,
  resultRawSignature,
  sameSignature,
} from "@backend/lib/payment/momo";
import { parseEnv } from "@backend/env";

/** MoMo wallet payments (step 6.4): signed strings, order ids, result codes, amount range, configuration. */
const keys = { partnerCode: "MOMOTEST", accessKey: "ACCESS", secretKey: "SECRET" };

describe("signatures (field order of MoMo's official samples)", () => {
  it("create payment: accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType", () => {
    const raw = createRawSignature(keys, {
      amount: 50_000,
      extraData: "",
      ipnUrl: "https://shop.test/api/payments/momo/webhook",
      orderId: "AG-20261120-7F3KQ2-0a1b2c3d4e",
      orderInfo: "Pay",
      redirectUrl: "https://shop.test/vi/checkout/result/AG-20261120-7F3KQ2",
      requestId: "req-1",
      requestType: "captureWallet",
    });
    expect(raw).toBe(
      "accessKey=ACCESS&amount=50000&extraData=&ipnUrl=https://shop.test/api/payments/momo/webhook&orderId=AG-20261120-7F3KQ2-0a1b2c3d4e" +
        "&orderInfo=Pay&partnerCode=MOMOTEST&redirectUrl=https://shop.test/vi/checkout/result/AG-20261120-7F3KQ2&requestId=req-1" +
        "&requestType=captureWallet",
    );
  });

  it("IPN: accessKey, amount, extraData, message, orderId, orderInfo, orderType, partnerCode, payType, requestId, responseTime, resultCode, transId", () => {
    const raw = resultRawSignature("ACCESS", {
      amount: "50000",
      extraData: "",
      message: "Successful.",
      orderId: "o1",
      orderInfo: "Pay",
      orderType: "momo_wallet",
      partnerCode: "MOMOTEST",
      payType: "qr",
      requestId: "r1",
      responseTime: "1763600000000",
      resultCode: "0",
      transId: "4088878653",
    });
    expect(raw).toBe(
      "accessKey=ACCESS&amount=50000&extraData=&message=Successful.&orderId=o1&orderInfo=Pay&orderType=momo_wallet" +
        "&partnerCode=MOMOTEST&payType=qr&requestId=r1&responseTime=1763600000000&resultCode=0&transId=4088878653",
    );
  });

  it("query: accessKey, orderId, partnerCode, requestId", () => {
    expect(queryRawSignature(keys, { orderId: "o1", requestId: "r1" })).toBe("accessKey=ACCESS&orderId=o1&partnerCode=MOMOTEST&requestId=r1");
  });

  it("HMAC-SHA256 hex with the secret key; comparison is exact and only accepts 64 hex chars", () => {
    const sig = momoSign("a=1&b=2", "SECRET");
    expect(sig).toBe(createHmac("sha256", "SECRET").update("a=1&b=2").digest("hex"));
    expect(sameSignature(sig, sig)).toBe(true);
    expect(sameSignature(sig.toUpperCase(), sig)).toBe(true);
    expect(sameSignature(momoSign("a=1&b=3", "SECRET"), sig)).toBe(false);
    expect(sameSignature(momoSign("a=1&b=2", "OTHER"), sig)).toBe(false);
    expect(sameSignature("", sig)).toBe(false);
    expect(sameSignature(sig.slice(0, 63), sig)).toBe(false);
    expect(sameSignature(`${sig.slice(0, 63)}z`, sig)).toBe(false);
  });
});

describe("MoMo order id", () => {
  it("is the order code plus a random suffix, and gives the code back", () => {
    const id = momoOrderId("AG-20261120-7F3KQ2", new Uint8Array([0, 1, 2, 254, 255]));
    expect(id).toBe("AG-20261120-7F3KQ2-000102feff");
    expect(id.length).toBeLessThanOrEqual(50);
    expect(orderCodeFromMomoOrderId(id)).toBe("AG-20261120-7F3KQ2");
  });

  it("refuses anything else", () => {
    expect(() => momoOrderId("AG-1", new Uint8Array(5))).toThrow();
    for (const bad of ["AG-20261120-7F3KQ2", "AG-20261120-7F3KQ2-000102feff-x", "AG-20261120-7F3KQ2-000102FEFF", "XX-20261120-7F3KQ2-000102feff", ""]) {
      expect(orderCodeFromMomoOrderId(bad)).toBeNull();
    }
  });
});

describe("result codes", () => {
  it("0 = paid; 1000 / 7000 / 7002 / 9000 = still in progress", () => {
    expect(momoResultStatus(0)).toBe("SUCCEEDED");
    for (const c of [1000, 7000, 7002, 9000]) expect(momoResultStatus(c)).toBe("PENDING");
  });
  it("1003 / 1006 / 1017 = cancelled; anything else = failed (1005 = link expired)", () => {
    for (const c of [1003, 1006, 1017]) expect(momoResultStatus(c)).toBe("CANCELLED");
    for (const c of [1001, 1004, 1005, 11, 12, 13, 20, 21, 41, 42, 99]) expect(momoResultStatus(c)).toBe("FAILED");
  });
});

describe("amounts, language, payment page", () => {
  it(`accepts ${MOMO_MIN_AMOUNT} – ${MOMO_MAX_AMOUNT} ₫ (whole numbers) only`, () => {
    expect(momoAmountSupported(MOMO_MIN_AMOUNT)).toBe(true);
    expect(momoAmountSupported(MOMO_MAX_AMOUNT)).toBe(true);
    for (const bad of [0, 999, MOMO_MAX_AMOUNT + 1, 1500.5, Number.NaN]) expect(momoAmountSupported(bad)).toBe(false);
  });
  it("MoMo's page is Vietnamese or English", () => {
    expect(momoLang("vi")).toBe("vi");
    expect(momoLang("en")).toBe("en");
    expect(momoLang("zh")).toBe("en");
  });
  it("only MoMo's own https pages are followed", () => {
    expect(isMomoPayUrl("https://test-payment.momo.vn/v2/gateway/pay?t=abc")).toBe(true);
    expect(isMomoPayUrl("https://payment.momo.vn/pay")).toBe(true);
    for (const bad of ["http://test-payment.momo.vn/pay", "https://momo.vn.evil.test/pay", "https://evilmomo.vn/pay", "javascript:alert(1)", "/checkout"]) {
      expect(isMomoPayUrl(bad)).toBe(false);
    }
  });
});

describe("public origin for the gateway", () => {
  const h = (values: Record<string, string>) => ({ get: (n: string) => values[n] ?? null });
  it("deployed: always APP_URL, whatever the request says", () => {
    expect(publicOrigin({ headers: h({ host: "evil.test", "x-forwarded-proto": "https" }), appUrl: "https://shop.example/x", deployed: true })).toBe(
      "https://shop.example",
    );
  });
  it("development: the address the browser used (e.g. a quick tunnel), else APP_URL", () => {
    const appUrl = "http://localhost:3000";
    expect(publicOrigin({ headers: h({ host: "localhost:3000" }), appUrl, deployed: false })).toBe("http://localhost:3000");
    expect(publicOrigin({ headers: h({ "x-forwarded-host": "abc-def.trycloudflare.com", "x-forwarded-proto": "https", host: "localhost:3000" }), appUrl, deployed: false })).toBe(
      "https://abc-def.trycloudflare.com",
    );
    expect(publicOrigin({ headers: h({}), appUrl, deployed: false })).toBe("http://localhost:3000");
    expect(publicOrigin({ headers: h({ host: "bad host/../x" }), appUrl, deployed: false })).toBe("http://localhost:3000");
    expect(publicOrigin({ headers: h({ host: "x.test", "x-forwarded-proto": "ftp" }), appUrl, deployed: false })).toBe("http://localhost:3000");
  });
});

describe("configuration (PAYMENT_PROVIDER=momo)", () => {
  const dev = { PAYMENT_PROVIDER: "momo", MOMO_PARTNER_CODE: "P", MOMO_ACCESS_KEY: "A", MOMO_SECRET_KEY: "S" };
  const prod = {
    ...dev,
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
    CRON_SECRET: "c".repeat(32),
  };
  it("defaults to MoMo's test environment and needs the three keys", () => {
    expect(parseEnv(dev).MOMO_ENDPOINT).toBe("https://test-payment.momo.vn");
    for (const key of ["MOMO_PARTNER_CODE", "MOMO_ACCESS_KEY", "MOMO_SECRET_KEY"]) {
      expect(() => parseEnv({ ...dev, [key]: "" })).toThrow(new RegExp(key));
    }
  });
  it("only MoMo's two endpoints; production must use the real one", () => {
    expect(parseEnv({ ...dev, MOMO_ENDPOINT: "https://payment.momo.vn/" }).MOMO_ENDPOINT).toBe("https://payment.momo.vn");
    expect(() => parseEnv({ ...dev, MOMO_ENDPOINT: "https://evil.test" })).toThrow(/MOMO_ENDPOINT/);
    expect(() => parseEnv(prod)).toThrow(/production/);
    expect(parseEnv({ ...prod, MOMO_ENDPOINT: "https://payment.momo.vn" }).PAYMENT_PROVIDER).toBe("momo");
  });
  it("the keys are not needed for the Demo gateway", () => {
    expect(() => parseEnv({ PAYMENT_PROVIDER: "demo" })).not.toThrow();
  });
});
