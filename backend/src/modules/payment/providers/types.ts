import type { PaymentEventStatus } from "@backend/lib/payment/rules";

/** Provider ids as stored in the database (enum PaymentProvider). */
/** MANUAL: an order an Admin recorded by hand (paid outside the site) — never an active gateway. */
export type ProviderId = "DEMO" | "PAYOS" | "VNPAY" | "MOMO" | "SEPAY" | "MANUAL";

/** A verified webhook, normalised. Only produced AFTER the provider checked the signature. */
export type PaymentEvent = {
  /** Unique per event at the provider — the idempotency key (WebhookEvent unique (provider, eventId)). */
  eventId: string;
  providerTxnId: string;
  orderCode: string;
  amountVnd: number;
  status: PaymentEventStatus;
  raw: unknown;
  /** Bank transfers (SePay): what an Admin needs when the transfer settles nothing (UnmatchedTransfer). */
  transfer?: { externalId: string; content: string; bankAccount: string; transferredAt: Date | null };
};

/** An authentic notification that settles nothing (e.g. MoMo "still waiting for the customer"). */
export const ACKNOWLEDGED = "acknowledged" as const;

export type CreatedPayment = {
  providerTxnId: string;
  /** Where to send the buyer: a path of this site (Demo, SePay transfer details) or the gateway's own https page (MoMo). */
  redirectTo: string;
  /** Saved with the payment so the buyer can come back to an unfinished payment ("Continue payment"). */
  resumeUrl?: string;
};

/**
 * One payment gateway (docs/ARCHITECTURE.md §4). Adding PayOS / VNPay = one more implementation; the order
 * flow does not change. The return page never grants anything — only a verified webhook does.
 */
export interface PaymentProviderAdapter {
  readonly id: ProviderId;
  /** URL slug in /api/payments/<slug>/webhook. */
  readonly slug: string;
  /** No real money moves (Demo, or a gateway's test environment): orders are marked isDemo. */
  readonly testMode: boolean;
  /** Totals the gateway accepts (VND, inclusive). Orders outside are refused before they are created. */
  readonly amountRange: { min: number; max: number };
  /**
   * Start a payment for an order. `origin` = this site's public origin (where the gateway sends the buyer
   * back and its notifications). Throws when the gateway cannot start the payment.
   */
  createPayment(order: { code: string; totalVnd: number; locale: string; origin: string }): Promise<CreatedPayment>;
  /**
   * Check the signature and parse the body. null = not authentic / malformed (never throws on bad input);
   * ACKNOWLEDGED = authentic but nothing to settle yet.
   */
  verifyWebhook(request: Request): Promise<PaymentEvent | typeof ACKNOWLEDGED | null>;
  /**
   * How the webhook answers an accepted notification: MoMo expects 204 No Content, SePay exactly
   * `{"success": true}` (anything else is retried).
   */
  readonly webhookAck: "json" | "noContent" | "success";
  /**
   * Bank transfer (SePay): the buyer may pay after the order expired (user choice 2026-11-20: an exact payment
   * still settles an EXPIRED order), and a transfer that settles nothing is kept for an Admin (UnmatchedTransfer)
   * instead of being refused — the money has already moved.
   */
  readonly bankTransfer: boolean;
  /**
   * Ask the gateway for the current state (reconcile cron, step 6.4). null = the gateway keeps no remote state
   * (Demo). Throws when the gateway cannot be reached.
   */
  queryStatus(providerTxnId: string): Promise<PaymentEventStatus | "PENDING" | null>;
}
