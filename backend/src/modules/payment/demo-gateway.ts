import "server-only";
import { randomBytes } from "node:crypto";
import { effectiveOrderStatus } from "@backend/lib/payment/rules";
import { getEnv } from "@backend/env";
import { findPaymentByTxn } from "@backend/modules/order/repository";
import { DEMO_SIGNATURE_HEADER, signDemoWebhook } from "./providers/demo-signature";
import { isDemoMode } from "./providers";
import { handlePaymentWebhook } from "./webhook";

/**
 * The Demo "gateway" (CLAUDE.md §6): a page where the buyer picks succeed / fail. Nothing here touches the
 * order directly — it builds the event a real gateway would send, SIGNS it, and hands it to the same webhook
 * handler. Available only in demo mode (refused in production at startup) and only to the order's owner.
 */
const TXN_RE = /^demo_[A-Za-z0-9_-]{16,64}$/;

export type DemoPaymentView = {
  orderCode: string;
  amountVnd: number;
  itemCount: number;
  /** A "more downloads" order (step 4.6): how many downloads it adds; null for packs. */
  extraDownloads: number | null;
  payable: boolean;
  expiresAt: Date | null;
};

async function findOwnDemoPayment(txnId: string, userId: string) {
  if (!isDemoMode() || !TXN_RE.test(txnId)) return null;
  const payment = await findPaymentByTxn("DEMO", txnId);
  return payment && payment.order.userId === userId && payment.order.isDemo ? payment : null;
}

export async function getDemoPayment(txnId: string, userId: string, now = new Date()): Promise<DemoPaymentView | null> {
  const p = await findOwnDemoPayment(txnId, userId);
  if (!p) return null;
  return {
    orderCode: p.order.code,
    amountVnd: p.amountVnd,
    itemCount: p.order.items.length,
    extraDownloads: p.order.items.every((i) => i.kind === "EXTRA_DOWNLOADS") ? p.order.items.reduce((n, i) => n + (i.extraDownloads ?? 0), 0) : null,
    payable: p.status === "PENDING" && effectiveOrderStatus(p.order, now) === "PENDING",
    expiresAt: p.order.expiresAt,
  };
}

export type DemoOutcome = "SUCCEEDED" | "FAILED";

/** Returns the order code to show next, or null when this payment is not the user's / not in demo mode. */
export async function completeDemoPayment(txnId: string, userId: string, outcome: DemoOutcome, now = new Date()): Promise<{ orderCode: string; ok: boolean } | null> {
  const p = await findOwnDemoPayment(txnId, userId);
  if (!p) return null;
  if (p.status !== "PENDING" || effectiveOrderStatus(p.order, now) !== "PENDING") return { orderCode: p.order.code, ok: false };

  const body = JSON.stringify({
    eventId: `evt_${randomBytes(16).toString("base64url")}`,
    txnId,
    orderCode: p.order.code,
    amountVnd: p.amountVnd,
    status: outcome,
  });
  const env = getEnv();
  const request = new Request(new URL("/api/payments/demo/webhook", env.APP_URL), {
    method: "POST",
    headers: { "content-type": "application/json", [DEMO_SIGNATURE_HEADER]: signDemoWebhook(body, env.AUTH_SECRET, now.getTime()) },
    body,
  });
  const response = await handlePaymentWebhook("demo", request);
  return { orderCode: p.order.code, ok: response.ok };
}
