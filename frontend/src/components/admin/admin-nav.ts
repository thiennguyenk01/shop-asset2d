/**
 * Admin area menu (CLAUDE.md §12 phase 5). `ready: false` items are built in later steps (5.2–5.7); they show
 * with a "Soon" tag and are not links, so the menu already tells the plan without dead ends.
 * `key` is a translation key under `admin.nav`.
 */
export type AdminNavKey = "overview" | "products" | "orders" | "users" | "coupons" | "audit" | "usage" | "settings";
export type AdminNavEntry = { key: AdminNavKey; href: string; ready: boolean };

export const ADMIN_NAV: AdminNavEntry[] = [
  { key: "overview", href: "/admin", ready: true },
  { key: "products", href: "/admin/products", ready: true },
  { key: "orders", href: "/admin/orders", ready: true },
  { key: "users", href: "/admin/users", ready: true },
  { key: "coupons", href: "/admin/coupons", ready: true },
  { key: "audit", href: "/admin/audit", ready: true },
  { key: "usage", href: "/admin/usage", ready: true },
  { key: "settings", href: "/admin/settings", ready: true },
];

/** "/admin" is active only on the overview itself; every other item on its own path and below. */
export function isAdminNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
