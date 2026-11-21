import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import type { Locale } from "@backend/i18n/routing";
import type { OrderStatus } from "@backend/lib/payment/rules";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";

/**
 * Admin orders (GĐ5.4): every order of every customer, read-only except the refund. Expiry is lazy (a PENDING
 * order past `expiresAt` counts as EXPIRED, lib/payment/rules.ts), so the status filter follows the same rule.
 */
function statusWhere(status: OrderStatus, now: Date): Prisma.OrderWhereInput {
  if (status === "PENDING") return { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  if (status === "EXPIRED") return { OR: [{ status: "EXPIRED" }, { status: "PENDING", expiresAt: { lte: now } }] };
  return { status };
}

/** The list filters (search + status) as a query, shared by the list and its money summary. */
function adminOrderWhere(filters: { q: string; status?: OrderStatus }, now: Date): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (filters.status) and.push(statusWhere(filters.status, now));
  if (filters.q) {
    and.push({
      OR: [
        { code: { contains: filters.q, mode: "insensitive" } },
        { buyerEmail: { contains: filters.q, mode: "insensitive" } },
        { user: { email: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}

/**
 * Money of every order the filters match (not only the page): totals per stored status × Demo, and the PENDING
 * orders already past their expiry (they count as EXPIRED, like the list).
 */
export function findAdminOrderMoney(filters: { q: string; status?: OrderStatus }, now: Date) {
  const where = adminOrderWhere(filters, now);
  return Promise.all([
    getDb().order.groupBy({ by: ["status", "isDemo"], where, _count: { _all: true }, _sum: { totalVnd: true, discountVnd: true } }),
    getDb().order.groupBy({
      by: ["isDemo"],
      where: { AND: [where, { status: "PENDING", expiresAt: { lte: now } }] },
      _count: { _all: true },
      _sum: { totalVnd: true, discountVnd: true },
    }),
  ]);
}

export function findAdminOrdersPage(
  filters: { q: string; status?: OrderStatus },
  locale: Locale,
  skip: number,
  take: number,
  now: Date,
) {
  const where = adminOrderWhere(filters, now);
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().order.count({ where }),
    getDb().order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        code: true,
        status: true,
        expiresAt: true,
        totalVnd: true,
        isDemo: true,
        createdAt: true,
        buyerName: true,
        buyerEmail: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            kind: true,
            extraDownloads: true,
            titleSnapshot: true,
            product: {
              select: {
                translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
              },
            },
          },
        },
      },
    }),
  ]);
}

/** One order with everything the Admin detail page shows. */
export function findAdminOrder(code: string, locale: Locale) {
  return getDb().order.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      subtotalVnd: true,
      discountVnd: true,
      totalVnd: true,
      isDemo: true,
      locale: true,
      buyerName: true,
      buyerEmail: true,
      createdAt: true,
      paidAt: true,
      coupon: { select: { code: true } },
      user: { select: { id: true, email: true, name: true, status: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          productType: true,
          kind: true,
          extraDownloads: true,
          titleSnapshot: true,
          priceSnapshotVnd: true,
          version: { select: { version: true } },
          product: {
            select: {
              slug: true,
              isDemoData: true,
              translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
              media: {
                where: { kind: "THUMBNAIL", sectionId: null },
                orderBy: { sortOrder: "asc" },
                take: 1,
                select: MEDIA_SELECT,
              },
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          provider: true,
          providerTxnId: true,
          amountVnd: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      refunds: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amountVnd: true,
          reason: true,
          status: true,
          createdAt: true,
          admin: { select: { email: true, name: true } },
        },
      },
      // Access granted BY THIS ORDER (a later purchase or a gift points elsewhere).
      entitlements: { select: { productId: true, revokedAt: true } },
    },
  });
}

/** What the refund check needs. */
export function findOrderForRefund(code: string) {
  return getDb().order.findUnique({
    where: { code },
    select: { id: true, status: true, expiresAt: true, totalVnd: true },
  });
}

export type RefundRowsResult = { ok: true; revoked: number } | { ok: false; error: "notPaid" };

/**
 * The refund itself, in ONE transaction (DECISIONS #33): PAID → REFUNDED (conditional, so a second click or a
 * second Admin at the same moment changes nothing) → Refund record → access granted by this order revoked →
 * bought downloads taken back (never below 0) → one sale less per pack (never below 0) → AuditLog.
 * The coupon use stays counted. Money is not moved here (Demo only; real gateways in GĐ6).
 */
export function refundOrderRows(
  orderId: string,
  reason: string,
  adminId: string,
  now: Date,
): Promise<RefundRowsResult> {
  return getDb().$transaction(
    async (tx) => {
      const moved = await tx.order.updateMany({ where: { id: orderId, status: "PAID" }, data: { status: "REFUNDED" } });
      if (moved.count === 0) return { ok: false as const, error: "notPaid" as const };

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          code: true,
          userId: true,
          totalVnd: true,
          items: { select: { productId: true, kind: true, extraDownloads: true } },
        },
      });
      await tx.refund.create({ data: { orderId, amountVnd: order.totalVnd, reason, status: "COMPLETED", adminId } });

      const revoked = await tx.entitlement.updateMany({
        where: { orderId, userId: order.userId, source: "PURCHASE", revokedAt: null },
        data: { revokedAt: now },
      });

      const extra = order.items.filter((i) => i.kind === "EXTRA_DOWNLOADS" && i.extraDownloads);
      for (const item of extra) {
        await tx.$executeRaw`UPDATE "DownloadCredit" SET "extraDownloads" = GREATEST("extraDownloads" - ${item.extraDownloads!}, 0), "updatedAt" = ${now} WHERE "userId" = ${order.userId} AND "productId" = ${item.productId}`;
      }

      // Counters only: the pack itself is not edited, so its updatedAt stays.
      const packIds = order.items.filter((i) => i.kind === "PACK").map((i) => i.productId);
      if (packIds.length > 0) {
        await tx.$executeRaw`UPDATE "Product" SET "salesCount" = GREATEST("salesCount" - 1, 0) WHERE "id" IN (${Prisma.join(packIds)})`;
      }

      await tx.auditLog.create({
        data: {
          adminId,
          action: "order.refund",
          entity: "Order",
          entityId: orderId,
          diff: {
            code: order.code,
            amountVnd: order.totalVnd,
            reason,
            revokedPacks: revoked.count,
            extraDownloads: extra.map((i) => ({ productId: i.productId, count: i.extraDownloads })),
          },
        },
      });
      return { ok: true as const, revoked: revoked.count };
    },
    { timeout: 20_000 },
  );
}
