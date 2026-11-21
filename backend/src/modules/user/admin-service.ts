import "server-only";
import type { Locale } from "@backend/i18n/routing";
import {
  ADMIN_USER_DETAIL_PAGE_SIZE,
  ADMIN_USERS_PAGE_SIZE,
  clampPage,
  lockBlock,
  parseLockReason,
  parseNote,
  unlockBlock,
  type LockBlock,
  type TextError,
  type UserRole,
  type UserStatus,
} from "@backend/lib/admin/user-rules";
import { MANUAL_ORDER_MAX_PACKS } from "@backend/lib/admin/manual-order-rules";
import { pickTranslation } from "@backend/lib/format";
import { effectiveOrderStatus, type OrderStatus } from "@backend/lib/payment/rules";
import { toMedia, type MediaData } from "@backend/modules/product/queries";
import {
  findAdminUser,
  findAdminUserPages,
  findAdminUsersPage,
  findGiftablePacks,
  findUserState,
  giftPackRows,
  lockUserRows,
  revokeGiftRows,
  unlockUserRows,
  type GiftRowsResult,
} from "./admin-repository";

/**
 * Admin users (GĐ5.5, DECISIONS #34): list, detail (orders, library), lock / unlock, gift / take back a pack.
 * The page and action layers check the Admin; this layer applies lib/admin/user-rules.ts.
 */
const USER_ID_RE = /^[a-z0-9]{10,40}$/;
const isUserId = (v: unknown): v is string => typeof v === "string" && USER_ID_RE.test(v);

export type AdminUserListItem = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  paidOrders: number;
  libraryCount: number;
};

export async function listAdminUsers(filters: { q: string; role?: UserRole; status?: UserStatus }, page: number) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findAdminUsersPage(
    filters,
    (safePage - 1) * ADMIN_USERS_PAGE_SIZE,
    ADMIN_USERS_PAGE_SIZE,
  );
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  if (safePage > pageCount && total > 0) return listAdminUsers(filters, pageCount);
  const items: AdminUserListItem[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    paidOrders: u._count.orders,
    libraryCount: u._count.entitlements,
  }));
  return { items, total, page: Math.min(safePage, pageCount), pageCount };
}

export type AdminUserView = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  preferredLocale: string;
  createdAt: Date;
  orderCount: number;
  downloadCount: number;
  /** Pages of the two lists below (5 per page, user request 2026-11-21). */
  ordersPage: { page: number; pageCount: number };
  libraryPage: { page: number; pageCount: number };
  libraryCount: number;
  orders: {
    code: string;
    status: OrderStatus;
    totalVnd: number;
    isDemo: boolean;
    createdAt: Date;
    itemCount: number;
  }[];
  library: {
    productId: string;
    slug: string;
    title: string;
    type: "FREE" | "PREMIUM";
    isDemoData: boolean;
    thumbnail: MediaData | null;
    source: "PURCHASE" | "FREE_CLAIM" | "ADMIN_GRANT";
    grantedAt: Date;
    revokedAt: Date | null;
    orderCode: string | null;
  }[];
  /** Premium packs on sale the customer does not own: what can be gifted or sold by hand (list price in VND). */
  giftable: { id: string; title: string; slug: string; priceVnd: number }[];
  /** Why "Lock" is not offered for this account by this Admin (null = it is). */
  lockBlock: LockBlock | null;
};

/** One account; `pages` = the raw page numbers from the URL for its orders and its library (bad values → 1). */
export async function getAdminUser(
  id: string,
  adminId: string,
  locale: Locale,
  pages: { orders?: unknown; library?: unknown } = {},
  now = new Date(),
): Promise<AdminUserView | null> {
  if (!isUserId(id)) return null;
  const [u, giftable] = await Promise.all([findAdminUser(id), findGiftablePacks(id, locale)]);
  if (!u) return null;
  const size = ADMIN_USER_DETAIL_PAGE_SIZE;
  const ordersPage = clampPage(pages.orders, u._count.orders, size);
  const libraryPage = clampPage(pages.library, u._count.entitlements, size);
  const [orders, entitlements] = await findAdminUserPages(
    id,
    locale,
    { skip: (ordersPage.page - 1) * size, take: size },
    { skip: (libraryPage.page - 1) * size, take: size },
  );
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    preferredLocale: u.preferredLocale,
    createdAt: u.createdAt,
    orderCount: u._count.orders,
    downloadCount: u._count.downloadLogs,
    ordersPage,
    libraryPage,
    libraryCount: u._count.entitlements,
    orders: orders.map((o) => ({
      code: o.code,
      status: effectiveOrderStatus(o, now),
      totalVnd: o.totalVnd,
      isDemo: o.isDemo,
      createdAt: o.createdAt,
      itemCount: o._count.items,
    })),
    library: entitlements.map((e) => ({
      productId: e.productId,
      slug: e.product.slug,
      title: pickTranslation(e.product.translations, locale)?.title ?? e.product.slug,
      type: e.product.type,
      isDemoData: e.product.isDemoData,
      thumbnail: e.product.media[0] ? toMedia(e.product.media[0]) : null,
      source: e.source,
      grantedAt: e.grantedAt,
      revokedAt: e.revokedAt,
      orderCode: e.order?.code ?? null,
    })),
    giftable: giftable.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: pickTranslation(p.translations, locale)?.title ?? p.slug,
      priceVnd: p.priceVnd,
    })),
    lockBlock: lockBlock(u, adminId),
  };
}

export type LockResult = { ok: true } | { ok: false; error: "notFound" | LockBlock | TextError };

export async function lockAdminUser(userId: string, rawReason: unknown, adminId: string): Promise<LockResult> {
  const reason = parseLockReason(rawReason);
  if (!reason.ok) return reason;
  if (!isUserId(userId)) return { ok: false, error: "notFound" };
  const target = await findUserState(userId);
  if (!target) return { ok: false, error: "notFound" };
  const block = lockBlock(target, adminId);
  if (block) return { ok: false, error: block };
  // Conditional write: if the account changed meanwhile (locked, made Admin), nothing happens.
  if (!(await lockUserRows(userId, adminId, reason.text))) {
    const now = await findUserState(userId);
    return { ok: false, error: (now && lockBlock(now, adminId)) || "alreadyLocked" };
  }
  return { ok: true };
}

export type UnlockResult = { ok: true } | { ok: false; error: "notFound" | "notLocked" | "tooLong" };

export async function unlockAdminUser(userId: string, rawNote: unknown, adminId: string): Promise<UnlockResult> {
  const note = parseNote(rawNote);
  if (!note.ok) return note;
  if (!isUserId(userId)) return { ok: false, error: "notFound" };
  const target = await findUserState(userId);
  if (!target) return { ok: false, error: "notFound" };
  const block = unlockBlock(target);
  if (block) return { ok: false, error: block };
  if (!(await unlockUserRows(userId, adminId, note.text))) return { ok: false, error: "notLocked" };
  return { ok: true };
}

export type GiftResult = GiftRowsResult | { ok: false; error: "userNotFound" | "tooLong" | "pickPack" | "tooManyPacks" };

/** Gift one pack or several at once (from the "Manual order" box, user choice 2026-11-21): all or nothing. */
export async function giftAdminPack(
  userId: string,
  productIds: unknown,
  rawNote: unknown,
  adminId: string,
  now = new Date(),
): Promise<GiftResult> {
  const note = parseNote(rawNote);
  if (!note.ok) return note;
  if (!isUserId(userId) || !(await findUserState(userId))) return { ok: false, error: "userNotFound" };
  const ids = Array.isArray(productIds) ? productIds : [productIds];
  if (ids.length === 0) return { ok: false, error: "pickPack" };
  if (ids.some((id) => typeof id !== "string" || id.length === 0 || id.length > 64)) return { ok: false, error: "notFound" };
  const unique = [...new Set(ids as string[])];
  if (unique.length > MANUAL_ORDER_MAX_PACKS) return { ok: false, error: "tooManyPacks" };
  return giftPackRows(userId, unique, adminId, note.text, now);
}

export async function revokeAdminGift(
  userId: string,
  productId: unknown,
  adminId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: "notGift" }> {
  if (!isUserId(userId) || typeof productId !== "string" || productId.length === 0 || productId.length > 64)
    return { ok: false, error: "notGift" };
  return (await revokeGiftRows(userId, productId, adminId, now)) ? { ok: true } : { ok: false, error: "notGift" };
}
