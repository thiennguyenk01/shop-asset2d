import "server-only";
import { checkPaymentEvent, orderStatusAfter } from "@backend/lib/payment/rules";
import { getDb } from "@backend/db";
import { findPaymentByTxn } from "@backend/modules/order/repository";
import type { PaymentEvent, ProviderId } from "./providers";

/**
 * Settle a VERIFIED payment event (CLAUDE.md §6 steps 4–5). This is the ONLY place that grants purchased packs.
 *
 * - The event must name this payment's order and its exact amount (else rejected, nothing changes).
 * - Idempotent: the event is recorded in WebhookEvent (unique provider + eventId) inside the same transaction,
 *   so a replayed or concurrent duplicate changes nothing. A different event for an already settled payment
 *   is acknowledged and ignored (status updates are conditional on PENDING).
 * - One transaction: Payment → Order → Entitlements (PURCHASE) / download credits (EXTRA_DOWNLOADS lines) →
 *   salesCount (packs) → coupon use + CouponRedemption →
 *   the bought packs leave the cart.
 */
export type SettleResult =
  | { result: "processed" | "duplicate" | "ignored"; orderCode: string }
  | { result: "unknownPayment" }
  | { result: "rejected"; reason: "orderMismatch" | "amountMismatch" };

export async function applyPaymentEvent(
  provider: ProviderId,
  event: PaymentEvent,
  now = new Date(),
  options: { acceptExpired?: boolean } = {},
): Promise<SettleResult> {
  if (!event.providerTxnId) return { result: "unknownPayment" };
  const payment = await findPaymentByTxn(provider, event.providerTxnId);
  if (!payment) return { result: "unknownPayment" };
  const { order } = payment;

  const check = checkPaymentEvent({ order, payment, event, acceptExpired: options.acceptExpired });
  if (check.kind === "reject") return { result: "rejected", reason: check.reason };

  return getDb().$transaction(
    async (tx) => {
      // Idempotency key first: a duplicate (or a concurrent twin, which waits on the unique index) stops here.
      const { count: fresh } = await tx.webhookEvent.createMany({
        data: [{ provider, eventId: event.eventId, payload: event.raw as object }],
        skipDuplicates: true,
      });
      if (fresh === 0) return { result: "duplicate" as const, orderCode: order.code };
      const done = () => tx.webhookEvent.update({ where: { provider_eventId: { provider, eventId: event.eventId } }, data: { processedAt: now } });

      if (check.kind === "ignore") {
        await done();
        return { result: "ignored" as const, orderCode: order.code };
      }

      // Conditional on PENDING (or EXPIRED for a late bank transfer): whatever another request did meanwhile wins,
      // this one becomes a no-op.
      const paid = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: check.status, rawPayload: event.raw as object },
      });
      if (paid.count === 0) {
        await done();
        return { result: "ignored" as const, orderCode: order.code };
      }
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: { in: options.acceptExpired ? ["PENDING", "EXPIRED"] : ["PENDING"] } },
        data: { status: orderStatusAfter(check.status), ...(check.status === "SUCCEEDED" ? { paidAt: now } : {}) },
      });
      if (moved.count === 0) throw new Error(`Order ${order.code} can no longer be paid while its payment was PENDING.`); // roll back everything

      if (check.status === "SUCCEEDED") {
        // "More downloads" lines (step 4.6) add to the buyer's credit for that free pack; they grant no pack.
        for (const item of order.items) {
          if (item.kind !== "EXTRA_DOWNLOADS" || !item.extraDownloads) continue;
          await tx.downloadCredit.upsert({
            where: { userId_productId: { userId: order.userId, productId: item.productId } },
            create: { userId: order.userId, productId: item.productId, extraDownloads: item.extraDownloads },
            update: { extraDownloads: { increment: item.extraDownloads } },
          });
        }
        const packItems = order.items.filter((i) => i.kind === "PACK");
        const productIds = packItems.map((i) => i.productId);
        const existing = new Map(
          (await tx.entitlement.findMany({ where: { userId: order.userId, productId: { in: productIds } }, select: { productId: true, revokedAt: true } })).map(
            (e) => [e.productId, e],
          ),
        );
        for (const item of packItems) {
          const owned = existing.get(item.productId);
          if (!owned) {
            await tx.entitlement.create({
              data: { userId: order.userId, productId: item.productId, licenseId: item.licenseId, source: "PURCHASE", orderId: order.id, grantedAt: now },
            });
          } else if (owned.revokedAt) {
            // Bought again after a refund: the new purchase restores access.
            await tx.entitlement.update({
              where: { userId_productId: { userId: order.userId, productId: item.productId } },
              data: { revokedAt: null, source: "PURCHASE", orderId: order.id, licenseId: item.licenseId, grantedAt: now },
            });
          }
        }
        await tx.product.updateMany({ where: { id: { in: productIds } }, data: { salesCount: { increment: 1 } } });
        if (order.couponId) {
          await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
          await tx.couponRedemption.create({ data: { couponId: order.couponId, orderId: order.id, userId: order.userId } });
        }
        await tx.cartItem.deleteMany({ where: { cart: { userId: order.userId }, productId: { in: productIds } } });
      }

      await done();
      return { result: "processed" as const, orderCode: order.code };
    },
    { timeout: 20_000 },
  );
}
