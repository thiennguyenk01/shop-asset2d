"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@backend/i18n/navigation";
import { CartBadge } from "./cart-count";

/** Desktop top-bar cart icon with the item count (mobile has the cart in the bottom tab bar). */
export function TopbarCartLink() {
  const t = useTranslations("header");
  const tc = useTranslations("cart");
  return (
    <Link
      href="/cart"
      aria-label={t("cart")}
      title={t("cart")}
      data-testid="topbar-cart"
      className="relative hidden size-9 place-items-center rounded-lg text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 lg:grid"
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      <CartBadge label={(n) => tc("badge", { count: n })} className="absolute -top-1 -right-1" />
    </Link>
  );
}
