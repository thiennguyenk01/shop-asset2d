import "server-only";
import { randomBytes } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  createRawSignature,
  isMomoPayUrl,
  MOMO_MAX_AMOUNT,
  MOMO_MIN_AMOUNT,
  MOMO_REQUEST_TYPE,
  MOMO_TEST_ENDPOINT,
  momoLang,
  momoOrderId,
  momoResultStatus,
  momoSign,
  orderCodeFromMomoOrderId,
  queryRawSignature,
  resultRawSignature,
  sameSignature,
  type MomoKeys,
  type MomoResultFields,
} from "@backend/lib/payment/momo";
import type { Locale } from "@backend/i18n/routing";
import { ACKNOWLEDGED, type PaymentEvent, type PaymentProviderAdapter } from "./types";

/**
 * MoMo wallet payments (step 6.4, DECISIONS #38; wallet only — QR / MoMo app). Flow (docs/ARCHITECTURE.md §4):
 * createPayment asks MoMo for a payment page (payUrl) and the buyer is sent there; MoMo then sends the result to
 * /api/payments/momo/webhook (IPN). Only that signed notification settles the order — the buyer coming back to
 * the result page never does (user choice 2026-11-20: keep that rule; test locally through a quick tunnel so
 * MoMo can reach the site). queryStatus is used by the reconcile job only to decide whether an overdue order may
 * expire; it never grants anything.
 */
export type MomoConfig = MomoKeys & { endpoint: string };

/** MoMo asks partners to allow up to 30 s for its answer. */
const TIMEOUT_MS = 30_000;
const MAX_BODY = 8192;

const createResponseSchema = z.object({
  resultCode: z.number().int(),
  message: z.string().optional(),
  payUrl: z.string().optional(),
});

const queryResponseSchema = z.object({ resultCode: z.number().int(), orderId: z.string().optional() });

/** IPN body: MoMo sends JSON; numbers are kept as their text form for the signature. */
const text = z.union([z.string(), z.number()]).transform((v) => String(v));
const ipnSchema = z.object({
  partnerCode: z.string().max(64),
  orderId: z.string().max(64),
  requestId: z.string().max(64),
  amount: text,
  orderInfo: z.string().max(1024),
  orderType: z.string().max(64),
  transId: text,
  resultCode: text,
  message: z.string().max(1024),
  payType: z.string().max(64),
  responseTime: text,
  extraData: z.string().max(2048).default(""),
  signature: z.string().max(128),
});

export class PaymentUnavailableError extends Error {}

type Deps = {
  fetch: typeof fetch;
  /** The text MoMo shows the buyer ("Payment for order …"), in the buyer's language. */
  describe: (code: string, locale: string) => Promise<string>;
};

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  describe: async (code, locale) => (await getTranslations({ locale: locale as Locale, namespace: "checkout.momo" }))("orderInfo", { code }),
};

export function createMomoProvider(config: MomoConfig, deps: Deps = defaultDeps): PaymentProviderAdapter {
  const keys = { partnerCode: config.partnerCode, accessKey: config.accessKey };

  async function post(path: string, body: object): Promise<unknown> {
    const res = await deps.fetch(`${config.endpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return res.json();
  }

  return {
    id: "MOMO",
    slug: "momo",
    testMode: config.endpoint === MOMO_TEST_ENDPOINT,
    amountRange: { min: MOMO_MIN_AMOUNT, max: MOMO_MAX_AMOUNT },
    webhookAck: "noContent",
    bankTransfer: false,

    async createPayment(order) {
      const fields = {
        amount: order.totalVnd,
        extraData: "",
        ipnUrl: `${order.origin}/api/payments/momo/webhook`,
        orderId: momoOrderId(order.code, randomBytes(5)),
        orderInfo: await deps.describe(order.code, order.locale),
        redirectUrl: `${order.origin}/${order.locale}/checkout/result/${order.code}`,
        requestId: `req-${randomBytes(12).toString("hex")}`,
        requestType: MOMO_REQUEST_TYPE,
      };
      const signature = momoSign(createRawSignature(keys, fields), config.secretKey);
      let answer;
      try {
        answer = createResponseSchema.safeParse(
          await post("/v2/gateway/api/create", { partnerCode: keys.partnerCode, ...fields, lang: momoLang(order.locale), signature }),
        );
      } catch (e) {
        throw new PaymentUnavailableError(`MoMo create failed for ${order.code}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!answer.success || answer.data.resultCode !== 0 || !answer.data.payUrl || !isMomoPayUrl(answer.data.payUrl)) {
        const why = answer.success ? `resultCode ${answer.data.resultCode} ${answer.data.message ?? ""}` : "malformed answer";
        throw new PaymentUnavailableError(`MoMo refused payment for ${order.code}: ${why}`);
      }
      return { providerTxnId: fields.orderId, redirectTo: answer.data.payUrl, resumeUrl: answer.data.payUrl };
    },

    async verifyWebhook(request: Request): Promise<PaymentEvent | typeof ACKNOWLEDGED | null> {
      const body = await request.text();
      if (body.length === 0 || body.length > MAX_BODY) return null;
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return null;
      }
      const parsed = ipnSchema.safeParse(json);
      if (!parsed.success) return null;
      const { signature, ...fields } = parsed.data satisfies MomoResultFields & { signature: string };
      if (fields.partnerCode !== keys.partnerCode) return null;
      if (!sameSignature(signature, momoSign(resultRawSignature(keys.accessKey, fields), config.secretKey))) return null;

      const orderCode = orderCodeFromMomoOrderId(fields.orderId);
      const amountVnd = Number(fields.amount);
      const resultCode = Number(fields.resultCode);
      if (!orderCode || !Number.isSafeInteger(amountVnd) || !Number.isSafeInteger(resultCode)) return null;

      const status = momoResultStatus(resultCode);
      if (status === "PENDING") return ACKNOWLEDGED;
      return {
        eventId: `momo:${fields.orderId}:${fields.transId}:${fields.resultCode}`,
        providerTxnId: fields.orderId,
        orderCode,
        amountVnd,
        status,
        raw: { ...fields, signature },
      };
    },

    /**
     * Informational only (never grants): the answer travels over HTTPS straight from MoMo. A network error
     * throws, and the reconcile job then leaves the order as it is until the next run.
     */
    async queryStatus(providerTxnId) {
      const requestId = `qry-${randomBytes(12).toString("hex")}`;
      const signature = momoSign(queryRawSignature(keys, { orderId: providerTxnId, requestId }), config.secretKey);
      const answer = queryResponseSchema.safeParse(
        await post("/v2/gateway/api/query", { partnerCode: keys.partnerCode, requestId, orderId: providerTxnId, lang: "en", signature }),
      );
      if (!answer.success) throw new Error(`MoMo query: malformed answer for ${providerTxnId}`);
      if (answer.data.orderId !== undefined && answer.data.orderId !== providerTxnId) throw new Error(`MoMo query: answer for another order`);
      return momoResultStatus(answer.data.resultCode);
    },
  };
}
