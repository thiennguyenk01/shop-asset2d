import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import { manualOrderAmounts } from "@backend/lib/admin/manual-order-rules";
import { pickTranslation } from "@backend/lib/format";
import { makeOrderCode } from "@backend/lib/payment/rules";
import { getDb } from "@backend/db";
import { localesFor } from "@backend/modules/product/queries";
import { randomBytes } from "node:crypto";
import type { Locale } from "@backend/i18n/routing";

/**
 * Orders an Admin records by hand (user choice 2026-11-21: the customer paid by a private transfer). Everything in
 * ONE transaction: the PAID order with its snapshots, a MANUAL payment (SUCCEEDED), the packs into the library
 * (PURCHASE, linked to the order, so a refund takes them back like any purchase), sales counts, the packs leave the
 * customer's cart, the linked unmatched transfer (if any) is marked handled, and the AuditLog row.
 */
export type ManualOrderRowsResult =
  | { ok: true; code: string }
  | { ok: false; error: "userNotFound" | "packUnavailable" | "alreadyOwned" | "amountTooHigh" | "transferUnavailable" };

export async function createManualOrderRows(input: {
  userId: string;
  productIds: string[];
  amountVnd: number;
  note: string;
  transferId: string | null;
  adminId: string;
  now: Date;
}): Promise<ManualOrderRowsResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await createOnce(input, makeOrderCode(input.now, randomBytes(6)));
    } catch (e) {
      // The readable code collided with another order (very unlikely): draw again.
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("code")) continue;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "alreadyOwned" }; // granted at the same moment
      throw e;
    }
  }
}

function createOnce(input: Parameters<typeof createManualOrderRows>[0], code: string) {
  const { userId, productIds, amountVnd, note, transferId, adminId, now } = input;
  return getDb().$transaction(
    async (tx): Promise<ManualOrderRowsResult> => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, preferredLocale: true } });
      if (!user) return { ok: false, error: "userNotFound" };
      const locale = user.preferredLocale as Locale;

      const packs = await tx.product.findMany({
        where: { id: { in: productIds }, type: "PREMIUM", status: "PUBLISHED" },
        select: {
          id: true,
          slug: true,
          priceVnd: true,
          currentVersionId: true,
          translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
          licenses: {
            where: { isDefault: true },
            take: 1,
            select: {
              license: {
                select: {
                  id: true,
                  code: true,
                  allowCommercial: true,
                  allowModification: true,
                  allowMultiProject: true,
                  allowRedistribution: true,
                  allowResale: true,
                  translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, name: true } },
                },
              },
            },
          },
        },
      });
      // Every pack must be on sale with its terms (same as the cart); one missing → nothing happens.
      if (packs.length !== productIds.length || packs.some((p) => !p.licenses[0])) return { ok: false, error: "packUnavailable" };

      const owned = await tx.entitlement.findMany({ where: { userId, productId: { in: productIds } }, select: { productId: true, revokedAt: true } });
      if (owned.some((e) => !e.revokedAt)) return { ok: false, error: "alreadyOwned" };

      const amounts = manualOrderAmounts(packs.map((p) => p.priceVnd), amountVnd);
      if (!amounts.ok) return { ok: false, error: "amountTooHigh" };

      let transfer: { id: string; isDemo: boolean; externalId: string; amountVnd: number } | null = null;
      if (transferId) {
        transfer = await tx.unmatchedTransfer.findFirst({ where: { id: transferId, resolvedAt: null }, select: { id: true, isDemo: true, externalId: true, amountVnd: true } });
        if (!transfer) return { ok: false, error: "transferUnavailable" };
      }

      const order = await tx.order.create({
        data: {
          code,
          userId,
          status: "PAID",
          subtotalVnd: amounts.subtotalVnd,
          discountVnd: amounts.discountVnd,
          totalVnd: amounts.totalVnd,
          couponId: null,
          buyerName: user.name ?? user.email,
          buyerEmail: user.email,
          locale,
          // A test-mode transfer moved no real money: the order is a Demo order then.
          isDemo: transfer?.isDemo ?? false,
          paidAt: now,
          expiresAt: null,
          items: {
            create: packs.map((p) => {
              const lic = p.licenses[0].license;
              return {
                productId: p.id,
                productType: "PREMIUM" as const,
                titleSnapshot: pickTranslation(p.translations, locale)?.title ?? p.slug,
                priceSnapshotVnd: p.priceVnd,
                licenseId: lic.id,
                licenseSnapshot: {
                  code: lic.code,
                  name: pickTranslation(lic.translations, locale)?.name ?? lic.code,
                  commercial: lic.allowCommercial,
                  modification: lic.allowModification,
                  multiProject: lic.allowMultiProject,
                  redistribution: lic.allowRedistribution,
                  resale: lic.allowResale,
                },
                versionId: p.currentVersionId,
              };
            }),
          },
        },
        select: { id: true, code: true },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: "MANUAL",
          providerTxnId: `manual_${order.code}`,
          amountVnd: amounts.totalVnd,
          status: "SUCCEEDED",
          rawPayload: { note, adminId, transferId: transfer?.id ?? null, transferExternalId: transfer?.externalId ?? null },
        },
      });

      const revoked = new Set(owned.map((e) => e.productId));
      for (const p of packs) {
        const licenseId = p.licenses[0].license.id;
        if (revoked.has(p.id)) {
          await tx.entitlement.update({
            where: { userId_productId: { userId, productId: p.id } },
            data: { revokedAt: null, source: "PURCHASE", orderId: order.id, licenseId, grantedAt: now },
          });
        } else {
          await tx.entitlement.create({ data: { userId, productId: p.id, licenseId, source: "PURCHASE", orderId: order.id, grantedAt: now } });
        }
      }
      await tx.product.updateMany({ where: { id: { in: productIds } }, data: { salesCount: { increment: 1 } } });
      await tx.cartItem.deleteMany({ where: { cart: { userId }, productId: { in: productIds } } });

      if (transfer) {
        await tx.unmatchedTransfer.update({
          where: { id: transfer.id },
          data: { resolvedAt: now, resolvedById: adminId, resolutionNote: `${order.code}: ${note}`.slice(0, 500) },
        });
      }
      await tx.auditLog.create({
        data: {
          adminId,
          action: "order.manual",
          entity: "Order",
          entityId: order.id,
          diff: {
            code: order.code,
            userId,
            amountVnd: amounts.totalVnd,
            listPriceVnd: amounts.subtotalVnd,
            productIds,
            note,
            transferId: transfer?.id ?? null,
            isDemo: transfer?.isDemo ?? false,
          },
        },
      });
      return { ok: true, code: order.code };
    },
    { timeout: 20_000 },
  );
}

/** Open unmatched transfers an Admin may link a manual order to (newest first). */
export function findOpenTransfersForLinking(take = 50) {
  return getDb().unmatchedTransfer.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, amountVnd: true, content: true, isDemo: true, transferredAt: true, createdAt: true },
  });
}
