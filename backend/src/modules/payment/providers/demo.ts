import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getEnv } from "@backend/env";
import { DEMO_SIGNATURE_HEADER, verifyDemoWebhook } from "./demo-signature";
import type { PaymentEvent, PaymentProviderAdapter } from "./types";

/**
 * Demo provider (CLAUDE.md §6): no money moves. Its "gateway" is our own page /checkout/demo/<txn> with
 * "succeed" / "fail" buttons, which sends a SIGNED webhook through the same handler a real gateway uses.
 * Refused in production by backend/src/env.ts (the app does not start).
 */
const MAX_BODY = 4096;

const eventSchema = z.object({
  eventId: z.string().regex(/^evt_[A-Za-z0-9_-]{8,64}$/),
  txnId: z.string().regex(/^demo_[A-Za-z0-9_-]{16,64}$/),
  orderCode: z.string().max(32),
  amountVnd: z.number().int().nonnegative(),
  status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED"]),
});

export const demoProvider: PaymentProviderAdapter = {
  id: "DEMO",
  slug: "demo",
  testMode: true,
  // Same range as before MoMo: any total, including 0 ₫ (a 100 % coupon).
  amountRange: { min: 0, max: Number.MAX_SAFE_INTEGER },
  webhookAck: "json",
  bankTransfer: false,

  async createPayment() {
    const providerTxnId = `demo_${randomBytes(18).toString("base64url")}`;
    return { providerTxnId, redirectTo: `/checkout/demo/${providerTxnId}` };
  },

  async verifyWebhook(request: Request): Promise<PaymentEvent | null> {
    const body = await request.text();
    if (body.length === 0 || body.length > MAX_BODY) return null;
    if (!verifyDemoWebhook(body, request.headers.get(DEMO_SIGNATURE_HEADER), getEnv().AUTH_SECRET)) return null;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) return null;
    const e = parsed.data;
    return { eventId: e.eventId, providerTxnId: e.txnId, orderCode: e.orderCode, amountVnd: e.amountVnd, status: e.status, raw: e };
  },

  async queryStatus() {
    return null; // the demo gateway has no remote state
  },
};
