import { describe, expect, it } from "vitest";
import { ADMIN_NAV, isAdminNavActive } from "@/components/admin/admin-nav";

describe("admin nav", () => {
  it("overview is active only on /admin itself; sections on their path and below", () => {
    expect(isAdminNavActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavActive("/admin", "/admin/products")).toBe(false);
    expect(isAdminNavActive("/admin/products", "/admin/products")).toBe(true);
    expect(isAdminNavActive("/admin/products", "/admin/products/abc")).toBe(true);
    expect(isAdminNavActive("/admin/products", "/admin/productsx")).toBe(false);
  });

  it("every entry lives under /admin and has a unique key", () => {
    expect(ADMIN_NAV.every((e) => e.href === "/admin" || e.href.startsWith("/admin/"))).toBe(true);
    expect(new Set(ADMIN_NAV.map((e) => e.key)).size).toBe(ADMIN_NAV.length);
    expect(ADMIN_NAV[0]).toMatchObject({ key: "overview", ready: true });
  });
});
