/**
 * Cart rules (CLAUDE.md §5), pure so they are unit-tested and shared by the service:
 * - no quantities (a pack is bought once);
 * - only PUBLISHED PREMIUM packs can be added; FREE packs are downloaded, never bought;
 * - a pack the user already owns cannot be added;
 * - prices are never stored in the cart — totals are always recomputed from the current product rows.
 */
export const CART_MAX_ITEMS = 50;

export type CartProductState = { status: "DRAFT" | "PUBLISHED" | "HIDDEN"; type: "FREE" | "PREMIUM" };

export type AddToCartBlock = "notFound" | "free" | "owned" | "alreadyInCart" | "cartFull";

export function addToCartBlock(input: {
  product: CartProductState | null;
  owned: boolean;
  inCart: boolean;
  cartSize: number;
}): AddToCartBlock | null {
  const { product } = input;
  if (!product || product.status !== "PUBLISHED") return "notFound";
  if (product.type !== "PREMIUM") return "free";
  if (input.owned) return "owned";
  if (input.inCart) return "alreadyInCart";
  if (input.cartSize >= CART_MAX_ITEMS) return "cartFull";
  return null;
}

/** A line can still be paid for only while the pack is a published Premium pack the user does not own. */
export type CartLineState = "ok" | "unavailable" | "owned";

export function cartLineState(product: CartProductState, owned: boolean): CartLineState {
  if (product.status !== "PUBLISHED" || product.type !== "PREMIUM") return "unavailable";
  if (owned) return "owned";
  return "ok";
}

export type CartTotals = { payableCount: number; subtotalVnd: number; savingsVnd: number };

/** Totals over the payable lines only (unavailable / owned lines are shown but never charged). */
export function cartTotals(lines: { state: CartLineState; priceVnd: number; compareAtPriceVnd: number | null }[]): CartTotals {
  let payableCount = 0;
  let subtotalVnd = 0;
  let savingsVnd = 0;
  for (const l of lines) {
    if (l.state !== "ok") continue;
    payableCount += 1;
    subtotalVnd += l.priceVnd;
    if (l.compareAtPriceVnd !== null && l.compareAtPriceVnd > l.priceVnd) savingsVnd += l.compareAtPriceVnd - l.priceVnd;
  }
  return { payableCount, subtotalVnd, savingsVnd };
}
