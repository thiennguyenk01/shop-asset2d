import { handlePaymentWebhook } from "@backend/modules/payment/webhook";

/** Payment gateway webhooks (CLAUDE.md §6). Only a verified webhook can mark an order PAID. */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/[provider]/webhook">) {
  const response = await handlePaymentWebhook((await params).provider, request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
