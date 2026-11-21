/**
 * Dashboard navigation (CLAUDE.md §13, 2026-11-14): left sidebar on desktop, bottom tab bar on mobile.
 * `key` is a translation key under `nav`; `icon` is resolved in nav-icon.tsx.
 * Targets built in later phases (library, cart, account, info pages) show the localized 404 until then.
 */
export type NavKey = "shop" | "premium" | "free" | "library" | "cart" | "account" | "stats" | "orders" | "about" | "faq";
export type NavEntry = { key: NavKey; href: string; icon: string };

/** Sidebar main group (desktop). */
export const MAIN_NAV: NavEntry[] = [
  { key: "shop", href: "/shop", icon: "store" },
  { key: "premium", href: "/shop?type=premium", icon: "gem" },
  { key: "free", href: "/shop?type=free", icon: "gift" },
  { key: "library", href: "/library", icon: "library" },
  { key: "cart", href: "/cart", icon: "cart" },
];

/** Contact is not a link: it is the floating chat button (layout/contact-chat.tsx). Legal links were removed from the menu (user request). */
export const SUPPORT_NAV: NavEntry[] = [
  { key: "about", href: "/about", icon: "info" },
  { key: "faq", href: "/faq", icon: "help" },
];

/**
 * Mobile bottom tab bar: 5 destinations + "More" (opens a sheet with everything else). Premium sits next to
 * Free, in the sidebar's order (user request 2026-11-20).
 */
export const TAB_NAV: NavEntry[] = [
  { key: "shop", href: "/shop", icon: "store" },
  { key: "premium", href: "/shop?type=premium", icon: "gem" },
  { key: "free", href: "/shop?type=free", icon: "gift" },
  { key: "library", href: "/library", icon: "library" },
  { key: "cart", href: "/cart", icon: "cart" },
];

/** Shown in the mobile "More" sheet (items not in the tab bar). */
export const MORE_NAV: NavEntry[] = [
  { key: "account", href: "/account", icon: "user" }, // signed out → the page sends you to /login and back
  { key: "stats", href: "/stats", icon: "chart" },
  { key: "orders", href: "/orders", icon: "receipt" },
];

/**
 * Whether a nav item is active for the current path + query.
 * - "/shop" is active on the shop without a type filter, and on product pages (a pack is part of the shop).
 * - "/shop?type=free" is active only with that filter.
 */
export function isNavActive(itemHref: string, pathname: string, search: string): boolean {
  const [path, query] = itemHref.split("?");
  const params = new URLSearchParams(search);
  if (path === "/shop" && !query && pathname.startsWith("/product/")) return true;
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  if (query) return [...new URLSearchParams(query)].every(([k, v]) => params.get(k) === v);
  return path !== "/shop" || !params.has("type");
}
