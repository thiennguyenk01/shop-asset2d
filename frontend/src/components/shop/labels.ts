import type { ShopSort, ShopType } from "@backend/lib/catalog/shop-params";

/** Maps URL values to translation keys under `shop.*`. */
export const SORT_KEY: Record<ShopSort, "newest" | "bestselling" | "priceAsc" | "priceDesc"> = {
  newest: "newest",
  bestselling: "bestselling",
  "price-asc": "priceAsc",
  "price-desc": "priceDesc",
};

export const TYPE_KEY: Record<ShopType, "free" | "premium"> = {
  free: "free",
  premium: "premium",
};
