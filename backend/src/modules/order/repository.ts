import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";
import type { ProviderId } from "@backend/modules/payment/providers";

/** What each order line snapshots: the pack's terms (flags + localized name) and its current version. */
export function findCheckoutSnapshots(userId: string, productIds: string[], locale: Locale) {
  return getDb().cartItem.findMany({
    where: { cart: { userId }, productId: { in: productIds } },
    select: {
      productId: true,
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
      product: { select: { type: true, currentVersionId: true } },
    },
  });
}

/** A free pack as the "more downloads" order needs it: status, title, version and its default terms. */
export function findPackForExtraDownloads(productId: string, locale: Locale) {
  return getDb().product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      type: true,
      status: true,
      slug: true,
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
}

export async function findCouponId(code: string): Promise<string | null> {
  return (await getDb().coupon.findUnique({ where: { code }, select: { id: true } }))?.id ?? null;
}

export type NewOrder = {
  code: string;
  userId: string;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  couponId: string | null;
  buyerName: string;
  buyerEmail: string;
  locale: Locale;
  isDemo: boolean;
  expiresAt: Date;
  items: {
    productId: string;
    productType: "FREE" | "PREMIUM";
    /** Default PACK; EXTRA_DOWNLOADS adds extraDownloads downloads of a free pack (step 4.6). */
    kind?: "PACK" | "EXTRA_DOWNLOADS";
    extraDownloads?: number | null;
    titleSnapshot: string;
    priceSnapshotVnd: number;
    licenseId: string;
    licenseSnapshot: Record<string, string | boolean>;
    versionId: string | null;
  }[];
};

/** Order + its lines in one write (PENDING). */
export function insertOrder(order: NewOrder) {
  const { items, ...data } = order;
  return getDb().order.create({ data: { ...data, status: "PENDING", items: { create: items } }, select: { id: true, code: true } });
}

export function insertPayment(orderId: string, provider: ProviderId, providerTxnId: string, amountVnd: number, resumeUrl?: string) {
  return getDb().payment.create({
    data: { orderId, provider, providerTxnId, amountVnd, status: "PENDING", ...(resumeUrl ? { rawPayload: { resumeUrl } } : {}) },
    select: { id: true },
  });
}

/** The gateway did not start the payment: the order never reached it (conditional on PENDING). */
export function markOrderFailed(orderId: string) {
  return getDb().order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "FAILED" } });
}

/** An order as its owner sees it (never another user's: the userId is part of the lookup). */
export function findOrderForUser(code: string, userId: string, locale: Locale) {
  return getDb().order.findFirst({
    where: { code, userId },
    select: {
      code: true,
      status: true,
      subtotalVnd: true,
      discountVnd: true,
      totalVnd: true,
      buyerName: true,
      buyerEmail: true,
      isDemo: true,
      createdAt: true,
      paidAt: true,
      expiresAt: true,
      coupon: { select: { code: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          kind: true,
          extraDownloads: true,
          titleSnapshot: true,
          priceSnapshotVnd: true,
          product: {
            select: {
              slug: true,
              isDemoData: true,
              translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
              media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
            },
          },
        },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, providerTxnId: true, status: true, rawPayload: true } },
    },
  });
}

/** A payment of the given provider, with the order fields the event check and the settlement need. */
export function findPaymentByTxn(provider: ProviderId, providerTxnId: string) {
  return getDb().payment.findUnique({
    where: { provider_providerTxnId: { provider, providerTxnId } },
    select: {
      id: true,
      status: true,
      amountVnd: true,
      providerTxnId: true,
      order: {
        select: {
          id: true,
          code: true,
          status: true,
          totalVnd: true,
          userId: true,
          couponId: true,
          expiresAt: true,
          isDemo: true,
          items: { select: { productId: true, licenseId: true, kind: true, extraDownloads: true } },
        },
      },
    },
  });
}

/** One page of a user's orders, newest first (order history). */
export function findOrdersPage(userId: string, locale: Locale, skip: number, take: number) {
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().order.count({ where: { userId } }),
    getDb().order.findMany({
      where: { userId },
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
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            kind: true,
            extraDownloads: true,
            titleSnapshot: true,
            product: { select: { translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } } } },
          },
        },
      },
    }),
  ]);
}
