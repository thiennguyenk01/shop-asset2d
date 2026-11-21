"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@backend/i18n/navigation";
import { CartBadge } from "@/components/cart/cart-count";
import { cn } from "@/lib/cn";
import { isNavActive, type NavEntry } from "./app-nav";
import { NavIcon } from "./nav-icon";

/**
 * One group of sidebar links (evondevKit shell.md "Sidebar"): h-10 rounded-xl, 4px apart; normal weight at
 * rest; the active item takes the brand accent (gold has hue → light accent background + accent text, medium
 * weight), no border or side bar. Reads the URL → render inside <Suspense>.
 */
/** `withTooltip`: desktop sidebar — the label fades when collapsed, so the name stays available as a tooltip. */
export function SidebarNav({ items, onNavigate, withTooltip }: { items: NavEntry[]; onNavigate?: () => void; withTooltip?: boolean }) {
  const t = useTranslations("nav");
  const tc = useTranslations("cart");
  const pathname = usePathname();
  const search = useSearchParams().toString();

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isNavActive(item.href, pathname, search);
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={withTooltip ? t(item.key) : undefined}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm whitespace-nowrap transition-colors",
                active ? "bg-gold-500/10 font-medium text-gold-300" : "text-ivory-100/70 hover:bg-ivory-100/5 hover:text-ivory-100",
              )}
            >
              <NavIcon name={item.icon} className="size-4 shrink-0" />
              <span className={cn("min-w-0 flex-1 truncate leading-normal", withTooltip && "transition-opacity duration-150 sidebar-collapsed:opacity-0")}>
                {t(item.key)}
              </span>
              {item.key === "cart" && (
                <CartBadge label={(n) => tc("badge", { count: n })} className={cn(withTooltip && "sidebar-collapsed:hidden")} />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
