import "server-only";
import type { Locale } from "@backend/i18n/routing";
import {
  addToCartBlock,
  CART_MAX_ITEMS,
  cartLineState,
  cartTotals,
  type AddToCartBlock,
  type CartLineState,
  type CartTotals,
} from "@backend/lib/cart/rules";
import type { CouponCheck } from "@backend/lib/cart/coupon";
import { pickTranslation } from "@backend/lib/format";
import { checkCouponCode } from "@backend/modules/coupon/service";
import { toMedia, type MediaData } from "@backend/modules/product/queries";
import {
  addCartItem,
  countCartItems,
  findCart,
  findCartLines,
  findGuestCartForMerge,
  findOrCreateCart,
  findProductForCart,
  moveGuestLines,
  ownedProductIds,
  removeCartItem,
  type CartOwner,
} from "./repository";

export type { CartOwner };

export type CartLine = {
  productId: string;
  slug: string;
  title: string;
  priceVnd: number;
  compareAtPriceVnd: number | null;
  isDemoData: boolean;
  thumbnail: MediaData | null;
  state: CartLineState;
  benefits: {
    commercial: boolean;
    modification: boolean;
    multiProject: boolean;
    redistribution: boolean;
    resale: boolean;
  };
};

export type CartView = { lines: CartLine[]; totals: CartTotals };

/** The cart as shown to its owner: current prices, and which lines can still be paid for. */
export async function getCartView(owner: CartOwner, locale: Locale): Promise<CartView> {
  const rows = await findCartLines(owner, locale);
  const owned =
    owner.kind === "user"
      ? await ownedProductIds(
          owner.userId,
          rows.map((r) => r.productId),
        )
      : new Set<string>();
  const lines: CartLine[] = rows.map((r) => ({
    productId: r.productId,
    slug: r.product.slug,
    title: pickTranslation(r.product.translations, locale)?.title ?? r.product.slug,
    priceVnd: r.product.priceVnd,
    compareAtPriceVnd: r.product.compareAtPriceVnd,
    isDemoData: r.product.isDemoData,
    thumbnail: r.product.media[0] ? toMedia(r.product.media[0]) : null,
    state: cartLineState(r.product, owned.has(r.productId)),
    benefits: {
      commercial: r.license.allowCommercial,
      modification: r.license.allowModification,
      multiProject: r.license.allowMultiProject,
      redistribution: r.license.allowRedistribution,
      resale: r.license.allowResale,
    },
  }));
  return { lines, totals: cartTotals(lines) };
}

export type CartSummary = CartView & {
  /** null = no code applied. A code that no longer qualifies is kept but gives no discount (and says why). */
  coupon: CouponCheck | null;
  discountVnd: number;
  totalVnd: number;
};

/** Cart + the applied coupon re-checked against today's payable subtotal. Phase 4 checkout reuses this. */
export async function getCartSummary(
  owner: CartOwner | null,
  locale: Locale,
  couponCode: string | null,
): Promise<CartSummary> {
  const view: CartView = owner ? await getCartView(owner, locale) : { lines: [], totals: cartTotals([]) };
  // A signed-in account also gets its per-account coupon limit checked (DECISIONS #35); guests at checkout.
  const userId = owner?.kind === "user" ? owner.userId : null;
  const coupon = couponCode ? await checkCouponCode(couponCode, view.totals.subtotalVnd, new Date(), userId) : null;
  const discountVnd = coupon?.ok ? coupon.discountVnd : 0;
  return { ...view, coupon, discountVnd, totalVnd: view.totals.subtotalVnd - discountVnd };
}

export function getCartCount(owner: CartOwner): Promise<number> {
  return countCartItems(owner);
}

export type AddToCartResult = { ok: true } | { ok: false; reason: AddToCartBlock };

export async function addToCart(owner: CartOwner, productId: string): Promise<AddToCartResult> {
  const [product, cart] = await Promise.all([findProductForCart(productId), findCart(owner)]);
  const licenseId = product?.licenses[0]?.licenseId;
  const owned =
    owner.kind === "user" && product ? (await ownedProductIds(owner.userId, [product.id])).has(product.id) : false;
  const block = addToCartBlock({
    product: product && licenseId ? product : null, // a pack without default terms cannot be sold
    owned,
    inCart: !!cart?.items.some((i) => i.productId === productId),
    cartSize: cart?.items.length ?? 0,
  });
  if (block) return { ok: false, reason: block };

  const target = cart ?? (await findOrCreateCart(owner));
  await addCartItem(target.id, productId, licenseId!);
  return { ok: true };
}

export async function removeFromCart(owner: CartOwner, productId: string): Promise<void> {
  await removeCartItem(owner, productId);
}

/**
 * On sign-in: move the guest cart into the user's cart. Lines that are no longer addable (free, hidden,
 * already owned, already in the user's cart, over the limit) are dropped. Returns how many lines moved.
 */
export async function mergeGuestCart(tokenHash: string, userId: string): Promise<number> {
  const guest = await findGuestCartForMerge(tokenHash);
  if (!guest) return 0;
  const userCart = await findOrCreateCart({ kind: "user", userId });
  const owned = await ownedProductIds(
    userId,
    guest.items.map((i) => i.productId),
  );
  const inUserCart = new Set(userCart.items.map((i) => i.productId));
  const lines: { productId: string; licenseId: string }[] = [];
  for (const item of guest.items) {
    const block = addToCartBlock({
      product: item.product,
      owned: owned.has(item.productId),
      inCart: inUserCart.has(item.productId),
      cartSize: userCart.items.length + lines.length,
    });
    if (block) continue;
    lines.push({ productId: item.productId, licenseId: item.licenseId });
    inUserCart.add(item.productId);
  }
  await moveGuestLines(guest.id, userCart.id, lines);
  return lines.length;
}

export { CART_MAX_ITEMS };
