import "server-only";
import { Prisma } from "@backend/generated/prisma/client";
import type { Locale } from "@backend/i18n/routing";
import { giftBlock, type UserRole, type UserStatus } from "@backend/lib/admin/user-rules";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";

/**
 * Admin users (GĐ5.5, DECISIONS #34). Every write runs in one transaction with its AuditLog row, and is
 * conditional on the state it changes, so a double click or two Admins at once change things only once.
 */
type Tx = Prisma.TransactionClient;
const audit = (tx: Tx, adminId: string, action: string, entityId: string, diff: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { adminId, action, entity: "User", entityId, diff } });

export function findAdminUsersPage(
  filters: { q: string; role?: UserRole; status?: UserStatus },
  skip: number,
  take: number,
) {
  const and: Prisma.UserWhereInput[] = [];
  if (filters.role) and.push({ role: filters.role });
  if (filters.status) and.push({ status: filters.status });
  if (filters.q) {
    and.push({
      OR: [
        { email: { contains: filters.q, mode: "insensitive" } },
        { name: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.UserWhereInput = { AND: and };
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().user.count({ where }),
    getDb().user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { orders: { where: { status: "PAID" } }, entitlements: { where: { revokedAt: null } } } },
      },
    }),
  ]);
}

const PACK_SELECT = (locale: Locale) =>
  ({
    slug: true,
    type: true,
    status: true,
    isDemoData: true,
    translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
    media: {
      where: { kind: "THUMBNAIL", sectionId: null },
      orderBy: { sortOrder: "asc" },
      take: 1,
      select: MEDIA_SELECT,
    },
  }) satisfies Prisma.ProductSelect;

/** One account with what the Admin detail page shows (orders and library: one page each, see findAdminUserPages). */
export function findAdminUser(id: string) {
  return getDb().user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      preferredLocale: true,
      createdAt: true,
      _count: { select: { orders: true, entitlements: true, downloadLogs: true } },
    },
  });
}

/** One page of an account's orders and one page of its library, newest first. */
export function findAdminUserPages(
  id: string,
  locale: Locale,
  orders: { skip: number; take: number },
  library: { skip: number; take: number },
) {
  const db = getDb();
  return Promise.all([
    db.order.findMany({
      where: { userId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...orders,
      select: {
        code: true,
        status: true,
        expiresAt: true,
        totalVnd: true,
        isDemo: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    db.entitlement.findMany({
      where: { userId: id },
      orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      ...library,
      select: {
        productId: true,
        source: true,
        grantedAt: true,
        revokedAt: true,
        order: { select: { code: true } },
        product: { select: PACK_SELECT(locale) },
      },
    }),
  ]);
}

/** Premium packs on sale that this customer has no access to now — what can be gifted. */
export function findGiftablePacks(userId: string, locale: Locale) {
  return getDb().product.findMany({
    where: { type: "PREMIUM", status: "PUBLISHED", entitlements: { none: { userId, revokedAt: null } } },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      priceVnd: true,
      translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
    },
  });
}

export function findUserState(id: string) {
  return getDb().user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
}

/** Lock: ACTIVE ordinary account → LOCKED + sessionVersion bump (every session dies on its next request). */
export function lockUserRows(userId: string, adminId: string, reason: string) {
  return getDb().$transaction(async (tx) => {
    const moved = await tx.user.updateMany({
      where: { id: userId, role: "USER", status: "ACTIVE" },
      data: { status: "LOCKED", sessionVersion: { increment: 1 } },
    });
    if (moved.count === 0) return false;
    await audit(tx, adminId, "user.lock", userId, { reason });
    return true;
  });
}

export function unlockUserRows(userId: string, adminId: string, note: string | null) {
  return getDb().$transaction(async (tx) => {
    const moved = await tx.user.updateMany({ where: { id: userId, status: "LOCKED" }, data: { status: "ACTIVE" } });
    if (moved.count === 0) return false;
    await audit(tx, adminId, "user.unlock", userId, { note });
    return true;
  });
}

export type GiftRowsResult =
  { ok: true } | { ok: false; error: "notFound" | "notPremium" | "notPublished" | "alreadyOwned" };

/** Thrown inside the gift transaction so that one blocked pack rolls back the packs before it. */
class GiftBlocked extends Error {
  constructor(readonly block: Exclude<GiftRowsResult, { ok: true }>["error"]) {
    super(block);
  }
}

/**
 * Gift packs: an ADMIN_GRANT entitlement each (a revoked one — refunded or taken back — is switched on again as a
 * gift), one AuditLog row per pack. All or nothing: the packs are re-read inside one transaction and any pack that
 * cannot be gifted cancels the whole gift; the (user, pack) unique key settles a race.
 */
export async function giftPackRows(
  userId: string,
  productIds: string[],
  adminId: string,
  note: string | null,
  now: Date,
): Promise<GiftRowsResult> {
  try {
    return await getDb().$transaction(async (tx) => {
      for (const productId of productIds) await giftOnePack(tx, userId, productId, adminId, note, now);
      return { ok: true as const };
    });
  } catch (e) {
    if (e instanceof GiftBlocked) return { ok: false, error: e.block };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "alreadyOwned" }; // gifted at the same moment
    throw e;
  }
}

async function giftOnePack(tx: Tx, userId: string, productId: string, adminId: string, note: string | null, now: Date) {
  const pack = await tx.product.findUnique({
    where: { id: productId },
    select: {
      type: true,
      status: true,
      licenses: { where: { isDefault: true }, take: 1, select: { licenseId: true } },
    },
  });
  const existing = await tx.entitlement.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { revokedAt: true },
  });
  // A pack without default terms cannot be owned (same as the cart): treated as missing.
  const block = giftBlock(pack?.licenses[0] ? pack : null, !!existing && !existing.revokedAt);
  if (block) throw new GiftBlocked(block);
  const licenseId = pack!.licenses[0].licenseId;
  if (existing) {
    const back = await tx.entitlement.updateMany({
      where: { userId, productId, revokedAt: { not: null } },
      data: { revokedAt: null, source: "ADMIN_GRANT", orderId: null, licenseId, grantedAt: now },
    });
    if (back.count === 0) throw new GiftBlocked("alreadyOwned");
  } else {
    await tx.entitlement.create({ data: { userId, productId, licenseId, source: "ADMIN_GRANT", grantedAt: now } });
  }
  await tx.cartItem.deleteMany({ where: { cart: { userId }, productId } }); // owned now: out of the cart
  await audit(tx, adminId, "user.gift", userId, { productId, note });
}

/** Take a gift back. Only ADMIN_GRANT access; a purchase is taken back by refunding its order (5.4). */
export function revokeGiftRows(userId: string, productId: string, adminId: string, now: Date) {
  return getDb().$transaction(async (tx) => {
    const revoked = await tx.entitlement.updateMany({
      where: { userId, productId, source: "ADMIN_GRANT", revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count === 0) return false;
    await audit(tx, adminId, "user.giftRevoke", userId, { productId });
    return true;
  });
}
