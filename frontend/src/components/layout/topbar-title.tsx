"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { ShopCrumbLink } from "@/components/shop/back-to-shop";
import { usePathname } from "@backend/i18n/navigation";

/**
 * Page title in the top bar (evondevKit shell.md "Đầu trang"): list pages have no in-content header, so
 * their name here IS the page <h1>. Detail pages have their own <h1>, so the bar only shows the parent
 * level as a link. One <h1> per page, one place for the title.
 */
/** Pages whose name in the top bar is their <h1>. */
const LIST_PAGES: Partial<Record<string, "account" | "stats" | "orders" | "cart" | "library" | "checkout">> = {
  "/account": "account",
  "/stats": "stats",
  "/orders": "orders",
  "/cart": "cart",
  "/library": "library",
  "/checkout": "checkout",
};

export function TopbarTitle() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  if (pathname === "/shop") {
    return <h1 className="truncate text-base leading-normal font-semibold text-ivory-100">{t("shop")}</h1>;
  }
  // Sub-pages share their section's <h1> (the demo gateway / payment result → Checkout, one order → Orders).
  const section = pathname.startsWith("/checkout/") ? "/checkout" : pathname.startsWith("/orders/") ? "/orders" : pathname;
  const listPage = LIST_PAGES[section];
  if (listPage) {
    return <h1 className="truncate text-base leading-normal font-semibold text-ivory-100">{t(listPage)}</h1>;
  }
  if (pathname.startsWith("/product/")) {
    return (
      <nav aria-label={t("mainLabel")} className="flex min-w-0 items-center gap-1 text-sm">
        <ShopCrumbLink className="-mx-1.5 inline-flex h-9 items-center rounded-lg px-1.5 font-medium text-ivory-100/70 transition-colors hover:text-ivory-100">
          {t("shop")}
        </ShopCrumbLink>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ivory-500" />
      </nav>
    );
  }
  return null;
}
