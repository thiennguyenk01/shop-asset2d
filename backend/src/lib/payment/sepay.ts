import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * SePay bank transfers (VietQR), user choice 2026-11-20: the buyer transfers to the shop's bank account with the
 * order's transfer code in the memo; SePay watches the account and POSTs every incoming transfer to
 * /api/payments/sepay/webhook, signed with HMAC-SHA256. Pure helpers (unit-tested); the adapter is
 * backend/src/modules/payment/providers/sepay.ts. Reference: developer.sepay.vn → SePay Webhooks.
 */

export const SEPAY_SIGNATURE_HEADER = "x-sepay-signature";
export const SEPAY_TIMESTAMP_HEADER = "x-sepay-timestamp";
/** SePay's guide: refuse a signed request older (or newer) than 5 minutes — stops replays. */
export const SEPAY_MAX_CLOCK_SKEW_SECONDS = 300;

export { SEPAY_MAX_AMOUNT, SEPAY_MIN_AMOUNT } from "./limits";

/** `sha256=<hex>` of `<timestamp>.<raw body>` — exactly what SePay sends in X-SePay-Signature. */
export function sepaySignature(timestamp: string, rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

/**
 * The request really comes from SePay and is fresh: the signature covers the timestamp and the raw body, and the
 * timestamp is within 5 minutes of now. Constant-time comparison.
 */
export function verifySepaySignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  nowMs: number;
}): boolean {
  const { signature, timestamp } = input;
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(input.nowMs / 1000 - Number(timestamp)) > SEPAY_MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = Buffer.from(sepaySignature(timestamp, input.rawBody, input.secret));
  const given = Buffer.from(signature.trim().toLowerCase());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * What the buyer writes in the transfer memo: the order code without dashes (AG-20261114-7F3KQ2 →
 * AG202611147F3KQ2) — banks often drop or change punctuation in memos.
 */
export function transferCodeOf(orderCode: string): string {
  return orderCode.replaceAll("-", "");
}

/** Order code alphabet of lib/payment/rules.ts (no 0 / 1 / I / L / O); dashes and spaces between the parts may vary. */
const CODE_IN_MEMO = /AG[\s-]*(\d{8})[\s-]*([2-9A-HJKMNP-Z]{6})/g;

/**
 * The order code a transfer memo names (AG-20261114-7F3KQ2 form), or null when it names none — or more than one
 * different code (ambiguous: an Admin decides). Case does not matter; banks often upper-case memos.
 */
export function orderCodeFromMemo(...texts: (string | null | undefined)[]): string | null {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.toUpperCase().matchAll(CODE_IN_MEMO)) found.add(`AG-${m[1]}-${m[2]}`);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** QR image for the transfer (VietQR, rendered by SePay's QR service: developer.sepay.vn → "Build QR payment page"). */
export function sepayQrImageUrl(input: { account: string; bank: string; amountVnd: number; memo: string }): string {
  const q = new URLSearchParams({ acc: input.account, bank: input.bank, amount: String(input.amountVnd), des: input.memo });
  return `https://vietqr.app/img?${q.toString()}`;
}

/** One transfer as SePay posts it (fields per developer.sepay.vn → SePay Webhooks → payload). */
export const sepayWebhookSchema = z.object({
  id: z.number().int().nonnegative(),
  gateway: z.string().max(100),
  transactionDate: z.string().max(40),
  accountNumber: z.string().max(40),
  subAccount: z.string().max(40).nullish(),
  code: z.string().max(100).nullish(),
  content: z.string().max(1000),
  transferType: z.enum(["in", "out"]),
  description: z.string().max(2000).nullish(),
  transferAmount: z.number().int().nonnegative(),
  accumulated: z.number().nullish(),
  referenceCode: z.string().max(100).nullish(),
});

/** "2026-11-20 14:02:37" (Vietnam time, UTC+7) → Date; null when the format is unexpected. */
export function sepayTransferTime(text: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Account numbers compare without spaces / case (banks print them grouped). */
export function sameBankAccount(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  return norm(a) === norm(b) && norm(a).length > 0;
}
