import { describe, expect, it } from "vitest";
import { isNavActive, MAIN_NAV, MORE_NAV, TAB_NAV } from "@/components/layout/app-nav";

describe("isNavActive", () => {
  it("store is active on /shop without a type filter and on product pages", () => {
    expect(isNavActive("/shop", "/shop", "")).toBe(true);
    expect(isNavActive("/shop", "/shop", "q=dragon")).toBe(true);
    expect(isNavActive("/shop", "/product/tien-hiep-dao-mon", "")).toBe(true);
    expect(isNavActive("/shop", "/shop", "type=free")).toBe(false);
    expect(isNavActive("/shop", "/shopping", "")).toBe(false);
  });

  it("free / premium are active only with their filter", () => {
    expect(isNavActive("/shop?type=free", "/shop", "type=free&q=x")).toBe(true);
    expect(isNavActive("/shop?type=free", "/shop", "")).toBe(false);
    expect(isNavActive("/shop?type=premium", "/product/x", "")).toBe(false);
  });

  it("other sections match their path and sub-paths", () => {
    expect(isNavActive("/library", "/library", "")).toBe(true);
    expect(isNavActive("/library", "/library/abc", "")).toBe(true);
    expect(isNavActive("/cart", "/library", "")).toBe(false);
  });
});

describe("navigation config", () => {
  it("mobile tab bar + More sheet reach every main destination", () => {
    const mobile = new Set([...TAB_NAV, ...MORE_NAV].map((i) => i.href));
    for (const item of MAIN_NAV) expect(mobile.has(item.href)).toBe(true);
    expect(TAB_NAV.length).toBeLessThanOrEqual(5); // + "More" = 6 tabs max (Premium added next to Free, user request 2026-11-20)
    expect(TAB_NAV.map((i) => i.key).slice(0, 3)).toEqual(["shop", "premium", "free"]);
    expect(MORE_NAV.some((i) => i.key === "premium")).toBe(false); // not twice
  });
});
