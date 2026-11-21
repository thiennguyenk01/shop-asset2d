import { describe, expect, it } from "vitest";
import { addToCartBlock, CART_MAX_ITEMS, cartLineState, cartTotals } from "@backend/lib/cart/rules";

const premium = { status: "PUBLISHED", type: "PREMIUM" } as const;

describe("addToCartBlock", () => {
  it("allows a published Premium pack that is not owned nor in the cart", () => {
    expect(addToCartBlock({ product: premium, owned: false, inCart: false, cartSize: 0 })).toBeNull();
  });

  it("blocks free, hidden/draft, owned, duplicate and over-limit adds", () => {
    expect(addToCartBlock({ product: null, owned: false, inCart: false, cartSize: 0 })).toBe("notFound");
    expect(addToCartBlock({ product: { status: "HIDDEN", type: "PREMIUM" }, owned: false, inCart: false, cartSize: 0 })).toBe("notFound");
    expect(addToCartBlock({ product: { status: "DRAFT", type: "PREMIUM" }, owned: false, inCart: false, cartSize: 0 })).toBe("notFound");
    expect(addToCartBlock({ product: { status: "PUBLISHED", type: "FREE" }, owned: false, inCart: false, cartSize: 0 })).toBe("free");
    expect(addToCartBlock({ product: premium, owned: true, inCart: false, cartSize: 0 })).toBe("owned");
    expect(addToCartBlock({ product: premium, owned: false, inCart: true, cartSize: 1 })).toBe("alreadyInCart");
    expect(addToCartBlock({ product: premium, owned: false, inCart: false, cartSize: CART_MAX_ITEMS })).toBe("cartFull");
  });
});

describe("cart lines and totals", () => {
  it("marks lines that can no longer be paid for", () => {
    expect(cartLineState(premium, false)).toBe("ok");
    expect(cartLineState(premium, true)).toBe("owned");
    expect(cartLineState({ status: "HIDDEN", type: "PREMIUM" }, false)).toBe("unavailable");
  });

  it("sums only payable lines and the savings against the old price", () => {
    expect(
      cartTotals([
        { state: "ok", priceVnd: 1_490_000, compareAtPriceVnd: 1_890_000 },
        { state: "ok", priceVnd: 690_000, compareAtPriceVnd: null },
        { state: "owned", priceVnd: 990_000, compareAtPriceVnd: null },
        { state: "unavailable", priceVnd: 500_000, compareAtPriceVnd: 900_000 },
      ]),
    ).toEqual({ payableCount: 2, subtotalVnd: 2_180_000, savingsVnd: 400_000 });
  });
});
