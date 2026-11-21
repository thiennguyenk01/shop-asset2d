import { describe, expect, it } from "vitest";
import { activeFilters, pageWindow, parseShopParams, priceSliderMax, shopQuery, toSearchSlug } from "@backend/lib/catalog/shop-params";
import { formatVnd, pickTranslation, savingPercent } from "@backend/lib/format";

describe("parseShopParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseShopParams({})).toEqual({ sort: "newest", page: 1 });
  });

  it("keeps valid values", () => {
    expect(
      parseShopParams({ q: "  kiếm   tiên ", genre: "wuxia", type: "free", min: "500000", max: "1500000", format: "png", sort: "price-asc", page: "3" }),
    ).toEqual({ q: "kiếm tiên", genre: "wuxia", type: "free", min: 500_000, max: 1_500_000, sort: "price-asc", page: 3 });
  });

  it("drops malformed or unknown values instead of failing", () => {
    expect(
      parseShopParams({ style: "../etc", genre: "Bad Slug!", type: "bundle", min: "cheap", max: "-5", format: "p n g", sort: "random", page: "-2" }),
    ).toEqual({ sort: "newest", page: 1 });
    expect(parseShopParams({ page: "abc" }).page).toBe(1);
    expect(parseShopParams({ page: "999999" }).page).toBe(1000);
  });

  it("swaps a reversed price range and ignores zero or absurd prices", () => {
    expect(parseShopParams({ min: "2000000", max: "500000" })).toMatchObject({ min: 500_000, max: 2_000_000 });
    expect(parseShopParams({ min: "0", max: "99999999999" })).toEqual({ sort: "newest", page: 1 });
    expect(parseShopParams({ min: "1e6", max: "1.5" })).toEqual({ sort: "newest", page: 1 });
  });

  it("uses the first value of repeated params and caps the search length", () => {
    expect(parseShopParams({ type: ["premium", "free"] }).type).toBe("premium");
    expect(parseShopParams({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("shopQuery", () => {
  const current = parseShopParams({ genre: "xianxia", sort: "price-desc", page: "4" });

  it("resets to page 1 when a filter or the sort changes", () => {
    expect(shopQuery(current, { type: "premium" })).toEqual({ genre: "xianxia", type: "premium", sort: "price-desc" });
    expect(shopQuery(current, { sort: "newest" })).toEqual({ genre: "xianxia" });
  });

  it("keeps filters when only the page changes, and removes a filter set to undefined", () => {
    expect(shopQuery(current, { page: 5 })).toEqual({ genre: "xianxia", sort: "price-desc", page: "5" });
    expect(shopQuery(current, { genre: undefined })).toEqual({ sort: "price-desc" });
  });

  it("lists active filters in a stable order, with min/max as one removable price chip", () => {
    expect(activeFilters(parseShopParams({ type: "free", q: "rong", max: "1000000" }))).toEqual([
      { key: "q", value: "rong", remove: { q: undefined } },
      { key: "type", value: "free", remove: { type: undefined } },
      { key: "price", value: "-1000000", remove: { min: undefined, max: undefined } },
    ]);
    const withPrice = parseShopParams({ genre: "wuxia", min: "500000", max: "900000" });
    expect(shopQuery(withPrice, { min: undefined, max: undefined })).toEqual({ genre: "wuxia" });
    expect(shopQuery(withPrice)).toEqual({ genre: "wuxia", min: "500000", max: "900000" });
  });

  it("rounds the slider end up to 500.000 ₫", () => {
    expect(priceSliderMax(1_690_000)).toBe(2_000_000);
    expect(priceSliderMax(1_500_000)).toBe(1_500_000);
    expect(priceSliderMax(0)).toBe(500_000);
  });
});

describe("toSearchSlug", () => {
  it("strips Vietnamese diacritics so unaccented searches match slugs", () => {
    expect(toSearchSlug("Kiếm Tiên")).toBe("kiem-tien");
    expect(toSearchSlug("Đan Dược & Linh Thảo")).toBe("dan-duoc-linh-thao");
    expect(toSearchSlug("  ")).toBe("");
  });
});

describe("format helpers", () => {
  it("formats VND per locale without converting currency", () => {
    expect(formatVnd(150000, "vi")).toMatch(/^150\.000\s₫$/);
    expect(formatVnd(150000, "en")).toBe("₫150,000");
    expect(formatVnd(150000, "zh")).toBe("₫150,000");
  });

  it("computes saving percentage only when the compare price is higher", () => {
    expect(savingPercent(899_000, 1_305_000)).toBe(31);
    expect(savingPercent(100, 100)).toBeNull();
    expect(savingPercent(100, null)).toBeNull();
  });

  it("falls back to Vietnamese when a translation is missing", () => {
    const rows = [
      { locale: "vi", title: "Kiếm" },
      { locale: "en", title: "Sword" },
    ];
    expect(pickTranslation(rows, "en")?.title).toBe("Sword");
    expect(pickTranslation(rows, "zh")?.title).toBe("Kiếm");
  });
});

describe("pageWindow", () => {
  it("shows first, last and neighbours with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10]);
  });
});
