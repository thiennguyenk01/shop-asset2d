import "server-only";
import {
  orderCodeFromMemo,
  SEPAY_MAX_AMOUNT,
  SEPAY_MIN_AMOUNT,
  SEPAY_SIGNATURE_HEADER,
  SEPAY_TIMESTAMP_HEADER,
  sameBankAccount,
  sepayTransferTime,
  sepayWebhookSchema,
  transferCodeOf,
  verifySepaySignature,
} from "@backend/lib/payment/sepay";
import { ACKNOWLEDGED, type PaymentEvent, type PaymentProviderAdapter } from "./types";

/**
 * SePay bank transfers (VietQR), user choice 2026-11-20. Flow (docs/ARCHITECTURE.md §4):
 * createPayment starts nothing remotely — the buyer is sent to the order page, which shows the shop's bank account,
 * the exact amount, the transfer code to write in the memo and a VietQR image. SePay watches the account and POSTs
 * each incoming transfer to /api/payments/sepay/webhook, signed with HMAC-SHA256 (X-SePay-Signature over
 * `<timestamp>.<raw body>`). Only such a signed notification, naming an order and its exact amount, settles the
 * order (payment/service.ts); anything else that moved money is kept for an Admin (UnmatchedTransfer).
 */
export type SepayConfig = {
  webhookSecret: string;
  bankAccount: string;
  /** Bank short name for the QR image (e.g. MBBank, Vietcombank). */
  bankName: string;
  /** SePay Test mode: transfers are simulated on my.sepay.vn, no money moves (orders marked Demo). */
  testMode: boolean;
};

const MAX_BODY = 16_384;

export function createSepayProvider(config: SepayConfig, now: () => number = Date.now): PaymentProviderAdapter {
  return {
    id: "SEPAY",
    slug: "sepay",
    testMode: config.testMode,
    amountRange: { min: SEPAY_MIN_AMOUNT, max: SEPAY_MAX_AMOUNT },
    webhookAck: "success",
    bankTransfer: true,

    async createPayment(order) {
      // The transfer code doubles as the payment's id at the gateway: unique per order, found again in the memo.
      return { providerTxnId: transferCodeOf(order.code), redirectTo: `/checkout/result/${order.code}` };
    },

    async verifyWebhook(request: Request): Promise<PaymentEvent | typeof ACKNOWLEDGED | null> {
      const rawBody = await request.text();
      if (rawBody.length === 0 || rawBody.length > MAX_BODY) return null;
      const signed = verifySepaySignature({
        rawBody,
        signature: request.headers.get(SEPAY_SIGNATURE_HEADER),
        timestamp: request.headers.get(SEPAY_TIMESTAMP_HEADER),
        secret: config.webhookSecret,
        nowMs: now(),
      });
      if (!signed) return null;
      let json: unknown;
      try {
        json = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const parsed = sepayWebhookSchema.safeParse(json);
      if (!parsed.success) return null;
      const t = parsed.data;

      // Money leaving the account, or another account linked to the same SePay company: nothing to settle.
      if (t.transferType !== "in") return ACKNOWLEDGED;
      if (!sameBankAccount(t.accountNumber, config.bankAccount)) {
        console.warn(`[payment] SEPAY transfer ${t.id} is for another bank account; ignored`);
        return ACKNOWLEDGED;
      }

      const orderCode = orderCodeFromMemo(t.code, t.content);
      return {
        eventId: `sepay:${t.id}`,
        providerTxnId: orderCode ? transferCodeOf(orderCode) : "",
        orderCode: orderCode ?? "",
        amountVnd: t.transferAmount,
        status: "SUCCEEDED",
        raw: t,
        transfer: { externalId: String(t.id), content: t.content, bankAccount: t.accountNumber, transferredAt: sepayTransferTime(t.transactionDate) },
      };
    },

    /**
     * A bank transfer has no remote "payment" to ask about: an overdue order expires, and a transfer that arrives
     * later still settles it through the webhook (user choice 2026-11-20).
     */
    async queryStatus() {
      return null;
    },
  };
}
