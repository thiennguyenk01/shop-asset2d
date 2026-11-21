import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getDb } from "@backend/db";
import { localesFor, MEDIA_SELECT } from "@backend/modules/product/queries";

/** Who a cart belongs to: a signed-in user, or a guest identified by the SHA-256 of their cookie token. */
export type CartOwner = { kind: "user"; userId: string } | { kind: "guest"; tokenHash: string };

const ownerWhere = (o: CartOwner) => (o.kind === "user" ? { userId: o.userId } : { guestToken: o.tokenHash });

export function findCart(owner: CartOwner) {
  return getDb().cart.findUnique({ where: ownerWhere(owner), select: { id: true, items: { select: { productId: true } } } });
}

export async function findOrCreateCart(owner: CartOwner) {
  const db = getDb();
  const existing = await findCart(owner);
  if (existing) return existing;
  try {
    return await db.cart.create({
      data: owner.kind === "user" ? { userId: owner.userId } : { guestToken: owner.tokenHash },
      select: { id: true, items: { select: { productId: true } } },
    });
  } catch {
    // Two parallel requests created it at the same time (unique userId / guestToken): use the winner.
    const again = await findCart(owner);
    if (!again) throw new Error("Cart could not be created");
    return again;
  }
}

export function countCartItems(owner: CartOwner) {
  return getDb().cartItem.count({ where: { cart: ownerWhere(owner) } });
}

/** Product facts the add-to-cart rule needs, plus its default terms (licenseId of the cart line). */
export function findProductForCart(productId: string) {
  return getDb().product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, type: true, licenses: { where: { isDefault: true }, select: { licenseId: true }, take: 1 } },
  });
}

/** Product ids among `productIds` the user owns right now (entitlement not revoked). */
export async function ownedProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await getDb().entitlement.findMany({
    where: { userId, productId: { in: productIds }, revokedAt: null },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

export function addCartItem(cartId: string, productId: string, licenseId: string) {
  // skipDuplicates: a double click cannot create two lines (unique cartId + productId).
  return getDb().cartItem.createMany({ data: [{ cartId, productId, licenseId }], skipDuplicates: true });
}

export async function removeCartItem(owner: CartOwner, productId: string) {
  const removed = await getDb().cartItem.deleteMany({ where: { productId, cart: ownerWhere(owner) } });
  // A removal leaves no line behind: mark the cart itself as changed, so the guest-cart clean-up (GĐ6.3) counts it.
  if (removed.count > 0) await getDb().cart.updateMany({ where: ownerWhere(owner), data: { updatedAt: new Date() } });
  return removed;
}

/** Cart lines with everything the cart page shows. Prices come from the product rows, never from the cart. */
export function findCartLines(owner: CartOwner, locale: Locale) {
  return getDb().cartItem.findMany({
    where: { cart: ownerWhere(owner) },
    orderBy: { createdAt: "asc" },
    select: {
      productId: true,
      license: { select: { allowCommercial: true, allowModification: true, allowMultiProject: true, allowRedistribution: true, allowResale: true } },
      product: {
        select: {
          id: true,
          slug: true,
          type: true,
          status: true,
          priceVnd: true,
          compareAtPriceVnd: true,
          isDemoData: true,
          translations: { where: { locale: { in: localesFor(locale) } }, select: { locale: true, title: true } },
          media: { where: { kind: "THUMBNAIL", sectionId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: MEDIA_SELECT },
        },
      },
    },
  });
}

/**
 * Move a guest cart into the user's cart (CLAUDE.md §5 "gộp giỏ khách vào giỏ tài khoản khi đăng nhập"),
 * in one transaction: only lines that are still addable move (`keep` decides), duplicates are skipped by the
 * unique key, then the guest cart is deleted.
 */
export async function moveGuestLines(guestCartId: string, userCartId: string, lines: { productId: string; licenseId: string }[]) {
  await getDb().$transaction([
    getDb().cartItem.createMany({ data: lines.map((l) => ({ cartId: userCartId, ...l })), skipDuplicates: true }),
    getDb().cart.delete({ where: { id: guestCartId } }),
  ]);
}

export function findGuestCartForMerge(tokenHash: string) {
  return getDb().cart.findUnique({
    where: { guestToken: tokenHash },
    select: {
      id: true,
      items: { select: { productId: true, licenseId: true, product: { select: { status: true, type: true } } } },
    },
  });
}
