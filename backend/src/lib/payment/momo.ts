import { createHmac, timingSafeEqual } from "node:crypto";
import { MOMO_MAX_AMOUNT, MOMO_MIN_AMOUNT } from "./limits";
import { ORDER_CODE_RE, type PaymentEventStatus } from "./rules";

/**
 * MoMo "one-time payment" (API v2, wallet only: requestType captureWallet — user choice 2026-11-20) — pure
 * rules, unit-tested. Field orders of the signed strings follow MoMo's official samples
 * (github.com/momo-wallet/payment: nodejs/MoMo.js, php/PayMoMo/ipn_momo.php, query_transaction.php): every
 * signature is HMAC-SHA256 (hex) with the secret key over "key=value&…" in a fixed order.
 */
export { MOMO_LIVE_ENDPOINT, MOMO_TEST_ENDPOINT } from "./momo-endpoints";
export const MOMO_REQUEST_TYPE = "captureWallet";

export { MOMO_MAX_AMOUNT, MOMO_MIN_AMOUNT } from "./limits";

export type MomoKeys = { partnerCode: string; accessKey: string; secretKey: string };

export function momoSign(raw: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(raw, "utf8").digest("hex");
}

/** Constant-time comparison of two hex signatures (false for anything that is not 64 hex chars). */
export function sameSignature(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}

export type MomoCreateFields = {
  amount: number;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  redirectUrl: string;
  requestId: string;
  requestType: string;
};

export function createRawSignature(keys: Pick<MomoKeys, "accessKey" | "partnerCode">, f: MomoCreateFields): string {
  return (
    `accessKey=${keys.accessKey}&amount=${f.amount}&extraData=${f.extraData}&ipnUrl=${f.ipnUrl}&orderId=${f.orderId}` +
    `&orderInfo=${f.orderInfo}&partnerCode=${keys.partnerCode}&redirectUrl=${f.redirectUrl}&requestId=${f.requestId}` +
    `&requestType=${f.requestType}`
  );
}

/** The IPN (and redirect) fields MoMo signs, as the strings it sent. */
export type MomoResultFields = {
  amount: string;
  extraData: string;
  message: string;
  orderId: string;
  orderInfo: string;
  orderType: string;
  partnerCode: string;
  payType: string;
  requestId: string;
  responseTime: string;
  resultCode: string;
  transId: string;
};

export function resultRawSignature(accessKey: string, f: MomoResultFields): string {
  return (
    `accessKey=${accessKey}&amount=${f.amount}&extraData=${f.extraData}&message=${f.message}&orderId=${f.orderId}` +
    `&orderInfo=${f.orderInfo}&orderType=${f.orderType}&partnerCode=${f.partnerCode}&payType=${f.payType}` +
    `&requestId=${f.requestId}&responseTime=${f.responseTime}&resultCode=${f.resultCode}&transId=${f.transId}`
  );
}

export function queryRawSignature(keys: Pick<MomoKeys, "accessKey" | "partnerCode">, f: { orderId: string; requestId: string }): string {
  return `accessKey=${keys.accessKey}&orderId=${f.orderId}&partnerCode=${keys.partnerCode}&requestId=${f.requestId}`;
}

/**
 * MoMo order id = "<our order code>-<10 hex>". The sandbox partner is shared by everyone who tests with MoMo's
 * public keys, so the code alone could already be taken there; the suffix keeps it unique. The order code is
 * read back from the (signed) order id, never from an unsigned field.
 */
const MOMO_ORDER_ID_RE = /^(AG-\d{8}-[2-9A-HJKMNP-Z]{6})-[0-9a-f]{10}$/;

export function momoOrderId(orderCode: string, random: Uint8Array): string {
  if (!ORDER_CODE_RE.test(orderCode)) throw new Error(`Invalid order code: ${orderCode}`);
  return `${orderCode}-${Buffer.from(random.slice(0, 5)).toString("hex")}`;
}

export function orderCodeFromMomoOrderId(orderId: string): string | null {
  return MOMO_ORDER_ID_RE.exec(orderId)?.[1] ?? null;
}

export function momoAmountSupported(amountVnd: number): boolean {
  return Number.isSafeInteger(amountVnd) && amountVnd >= MOMO_MIN_AMOUNT && amountVnd <= MOMO_MAX_AMOUNT;
}

/** MoMo shows its page in Vietnamese or English only; the Chinese shop gets English. */
export function momoLang(locale: string): "vi" | "en" {
  return locale === "vi" ? "vi" : "en";
}

/**
 * MoMo result codes → our payment state. 0 = paid. Still in progress: 1000 (waiting for the customer to
 * confirm), 7000 / 7002 (being processed), 9000 (authorised, not yet captured). Cancelled by the customer, by
 * MoMo or by the shop: 1003, 1006, 1017. Every other code is a failure (1005 = the payment link / QR expired).
 */
const PENDING_CODES = new Set([1000, 7000, 7002, 9000]);
const CANCELLED_CODES = new Set([1003, 1006, 1017]);

export function momoResultStatus(resultCode: number): PaymentEventStatus | "PENDING" {
  if (resultCode === 0) return "SUCCEEDED";
  if (PENDING_CODES.has(resultCode)) return "PENDING";
  if (CANCELLED_CODES.has(resultCode)) return "CANCELLED";
  return "FAILED";
}

/** Only MoMo's own https pages are followed after "create payment" (never an arbitrary URL). */
export function isMomoPayUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "momo.vn" || u.hostname.endsWith(".momo.vn"));
  } catch {
    return false;
  }
}
