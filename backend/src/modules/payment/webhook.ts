import "server-only";
import type { UnmatchedTransferReason } from "@backend/generated/prisma/client";
import { ACKNOWLEDGED, getActiveProvider, type PaymentProviderAdapter } from "./providers";
import { applyPaymentEvent, type SettleResult } from "./service";
import { insertUnmatchedTransfer } from "./unmatched-repository";

/**
 * Webhook entry (docs/ARCHITECTURE.md §4 step 4), shared by the route /api/payments/[provider]/webhook and the
 * Demo gateway page — so the demo really goes through the same signature check and settlement as a real gateway.
 * Answers: accepted (processed / duplicate / ignored / nothing to settle yet) → 200 with a short status word, or
 * 204 / `{"success": true}` for a gateway that expects it (MoMo / SePay) · 400 wrong order or amount · 401 bad
 * signature · 404 unknown. The body never says more than a short status word.
 *
 * Bank transfers (SePay): the money has already moved, so a signed transfer that settles nothing (no order code,
 * wrong amount, order already closed) is kept as an UnmatchedTransfer for an Admin and acknowledged — refusing it
 * would only make SePay send it again.
 */
export async function handlePaymentWebhook(slug: string, request: Request): Promise<Response> {
  let provider;
  try {
    provider = getActiveProvider();
  } catch {
    return Response.json({ status: "unknownProvider" }, { status: 404 });
  }
  if (provider.slug !== slug) return Response.json({ status: "unknownProvider" }, { status: 404 });

  const event = await provider.verifyWebhook(request);
  if (!event) return Response.json({ status: "invalidSignature" }, { status: 401 });
  if (event === ACKNOWLEDGED) return accepted(provider, "acknowledged");

  const settled = await applyPaymentEvent(provider.id, event, new Date(), { acceptExpired: provider.bankTransfer });
  if (provider.bankTransfer && event.transfer) {
    const reason = unmatchedReason(settled);
    if (reason) {
      await insertUnmatchedTransfer({
        provider: provider.id,
        externalId: event.transfer.externalId,
        reason,
        amountVnd: event.amountVnd,
        content: event.transfer.content,
        orderCode: event.orderCode || null,
        bankAccount: event.transfer.bankAccount,
        isDemo: provider.testMode,
        transferredAt: event.transfer.transferredAt,
        payload: event.raw as object,
      });
      console.warn(`[payment] ${provider.id} transfer ${event.transfer.externalId} settled nothing (${reason}); kept for an Admin`);
      return accepted(provider, "unmatched");
    }
  }
  switch (settled.result) {
    case "processed":
    case "duplicate":
    case "ignored":
      return accepted(provider, settled.result);
    case "unknownPayment":
      return Response.json({ status: "unknownPayment" }, { status: 404 });
    case "rejected":
      console.warn(`[payment] ${provider.id} event ${event.eventId} rejected: ${settled.reason}`);
      return Response.json({ status: settled.reason }, { status: 400 });
  }
}

/** Why a bank transfer settled nothing, or null when it did (or is a replay of one already handled). */
function unmatchedReason(settled: SettleResult): UnmatchedTransferReason | null {
  switch (settled.result) {
    case "unknownPayment":
      return "NO_ORDER";
    case "rejected":
      return settled.reason === "amountMismatch" ? "AMOUNT_MISMATCH" : "NO_ORDER";
    case "ignored":
      return "ORDER_CLOSED"; // a new transfer for an order already paid / cancelled / failed / refunded
    case "processed":
    case "duplicate":
      return null;
  }
}

function accepted(provider: PaymentProviderAdapter, status: string): Response {
  if (provider.webhookAck === "noContent") return new Response(null, { status: 204 });
  // SePay retries anything but exactly {"success": true}.
  if (provider.webhookAck === "success") return Response.json({ success: true }, { status: 200 });
  return Response.json({ status }, { status: 200 });
}
