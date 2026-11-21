import { randomBytes } from "node:crypto";
import { getDb } from "@backend/db";
import { addToCart } from "@backend/modules/cart/service";
import { placeExtraDownloadsOrder, placeOrder } from "@backend/modules/order/service";
import { DEMO_SIGNATURE_HEADER, signDemoWebhook } from "@backend/modules/payment/providers/demo-signature";
import { handlePaymentWebhook } from "@backend/modules/payment/webhook";

/**
 * Throw-away rows for the integration tests. Everything carries one random tag (slugs `it-<tag>-…`, emails
 * `it-<tag>-…@example.test`, event ids `evt_it<tag>…`) and `cleanup(tag)` removes exactly those rows.
 * Packs are `isDemoData`, so a full `db:seed` also wipes any leftover of an interrupted run.
 */
export const db = () => getDb();

export function newTag(): string {
  return randomBytes(5).toString("hex");
}

export async function createUser(tag: string, label: string) {
  return db().user.create({
    data: { email: `it-${tag}-${label}@example.test`, name: `IT ${label}`, passwordHash: null },
    select: { id: true, email: true },
  });
}

type PackOptions = { type: "FREE" | "PREMIUM"; status?: "DRAFT" | "PUBLISHED" | "HIDDEN"; priceVnd?: number };

/** A pack with one version, one private file and its default terms — the shape the shop sells. */
export async function createPack(tag: string, label: string, { type, status = "PUBLISHED", priceVnd }: PackOptions) {
  const license = await db().license.findUniqueOrThrow({ where: { code: type }, select: { id: true } });
  const slug = `it-${tag}-${label}`;
  const product = await db().product.create({
    data: {
      slug,
      type,
      status,
      priceVnd: type === "FREE" ? 0 : (priceVnd ?? 150_000),
      isDemoData: true,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      translations: {
        create: {
          locale: "vi",
          title: `IT ${label}`,
          shortDescription: "integration test",
          description: "integration test",
          contentsList: [],
        },
      },
      licenses: { create: { licenseId: license.id, isDefault: true } },
      versions: {
        create: {
          version: "1.0.0",
          files: {
            create: {
              storageKey: `it/${tag}/${label}.zip`,
              filename: `${label}.zip`,
              sizeBytes: 1,
              sha256: "0".repeat(64),
              mimeType: "application/zip",
            },
          },
        },
      },
    },
    select: { id: true, versions: { select: { id: true, files: { select: { id: true, storageKey: true } } } } },
  });
  const version = product.versions[0];
  await db().product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });
  return { id: product.id, slug, fileId: version.files[0].id, storageKey: version.files[0].storageKey };
}

export async function setStatus(productId: string, status: "DRAFT" | "PUBLISHED" | "HIDDEN") {
  await db().product.update({ where: { id: productId }, data: { status } });
}

/** Cart → placeOrder exactly like the checkout page; returns the pending order and its demo transaction. */
export async function placePendingOrder(userId: string, productId: string, totalVnd: number) {
  const added = await addToCart({ kind: "user", userId }, productId);
  if (!added.ok && added.reason !== "alreadyInCart") throw new Error(`addToCart: ${added.reason}`);
  const placed = await placeOrder({ userId, locale: "vi", couponCode: null, expectedTotalVnd: totalVnd });
  if (!placed.ok) throw new Error(`placeOrder: ${placed.reason}`);
  const order = await db().order.findUniqueOrThrow({
    where: { code: placed.orderCode },
    select: { id: true, code: true, totalVnd: true, payments: { select: { providerTxnId: true } } },
  });
  return { orderId: order.id, code: order.code, totalVnd: order.totalVnd, txnId: order.payments[0].providerTxnId! };
}

let eventSeq = 0;
export function eventId(tag: string): string {
  eventSeq += 1;
  return `evt_it${tag}${eventSeq.toString().padStart(4, "0")}`;
}

/** A demo gateway webhook, signed like the gateway page signs it, through the shared webhook handler. */
export async function sendWebhook(
  body: {
    eventId: string;
    txnId: string;
    orderCode: string;
    amountVnd: number;
    status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  },
  options: { slug?: string; secret?: string } = {},
): Promise<{ status: number; result: string }> {
  const json = JSON.stringify(body);
  const request = new Request("http://localhost/api/payments/demo/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [DEMO_SIGNATURE_HEADER]: signDemoWebhook(json, options.secret ?? process.env.AUTH_SECRET),
    },
    body: json,
  });
  const response = await handlePaymentWebhook(options.slug ?? "demo", request);
  return { status: response.status, result: ((await response.json()) as { status: string }).status };
}

export async function cleanup(tag: string) {
  const users = await db().user.findMany({ where: { email: { startsWith: `it-${tag}-` } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const products = await db().product.findMany({ where: { slug: { startsWith: `it-${tag}-` } }, select: { id: true } });
  const productIds = products.map((p) => p.id);

  await db().webhookEvent.deleteMany({ where: { eventId: { startsWith: `evt_it${tag}` } } });
  await db().entitlement.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] },
  });
  await db().downloadCredit.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { productId: { in: productIds } }] },
  });
  await db().refund.deleteMany({
    where: { OR: [{ order: { userId: { in: userIds } } }, { adminId: { in: userIds } }] },
  }); // refunds block orders + admins
  await db().payment.deleteMany({ where: { order: { userId: { in: userIds } } } });
  await db().order.deleteMany({ where: { userId: { in: userIds } } }); // items cascade
  await db().product.updateMany({ where: { id: { in: productIds } }, data: { currentVersionId: null } });
  await db().product.deleteMany({ where: { id: { in: productIds } } }); // versions, files, logs, cart lines cascade
  await db().auditLog.deleteMany({ where: { adminId: { in: userIds } } }); // admin actions of test users
  await db().user.deleteMany({ where: { id: { in: userIds } } }); // cart cascades
}

/** "Buy more downloads" exactly like the library button does; returns the pending order and its transaction. */
export async function placeExtraDownloads(userId: string, productId: string) {
  const placed = await placeExtraDownloadsOrder({ userId, productId, locale: "vi" });
  if (!placed.ok) return placed;
  const order = await db().order.findUniqueOrThrow({
    where: { code: placed.orderCode },
    select: {
      id: true,
      code: true,
      totalVnd: true,
      payments: { select: { providerTxnId: true } },
      items: { select: { kind: true, extraDownloads: true } },
    },
  });
  return {
    ok: true as const,
    orderId: order.id,
    code: order.code,
    totalVnd: order.totalVnd,
    txnId: order.payments[0].providerTxnId!,
    items: order.items,
  };
}

/**
 * Pin the "more downloads" offer (shop settings, step 5.6) for one test file, so tests that count downloads do not
 * depend on what the Admin saved in the dev database. Returns a function that puts the row back as it was.
 */
export async function pinExtraDownloadsOffer(offer: { count: number; priceVnd: number }) {
  const before = await db().shopSettings.findUnique({ where: { id: 1 } });
  const data = { extraDownloadsCount: offer.count, extraDownloadsPriceVnd: offer.priceVnd };
  await db().shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return async () => {
    if (before)
      await db().shopSettings.update({
        where: { id: 1 },
        data: {
          extraDownloadsCount: before.extraDownloadsCount,
          extraDownloadsPriceVnd: before.extraDownloadsPriceVnd,
        },
      });
    else await db().shopSettings.deleteMany({ where: { id: 1 } });
  };
}
