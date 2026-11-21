"use client";

import {
  LayoutDashboard,
  Package,
  ReceiptText,
  HardDrive,
  ScrollText,
  Settings,
  TicketPercent,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_NAV, isAdminNavActive, type AdminNavKey } from "./admin-nav";

const ICONS: Record<AdminNavKey, LucideIcon> = {
  overview: LayoutDashboard,
  products: Package,
  orders: ReceiptText,
  users: UsersRound,
  coupons: TicketPercent,
  audit: ScrollText,
  usage: HardDrive,
  settings: Settings,
};

/**
 * Admin menu. `layout="column"`: desktop sidebar (same item style as the store sidebar). `layout="row"`:
 * mobile strip under the top bar, scrolls sideways. Items of later steps are greyed with "Soon".
 * Reads the URL → render inside <Suspense>.
 */
export function AdminNavList({ layout }: { layout: "column" | "row" }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  return (
    <ul
      className={cn(
        layout === "column" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]",
      )}
    >
      {ADMIN_NAV.map((item) => {
        const Icon = ICONS[item.key];
        const active = isAdminNavActive(item.href, pathname);
        const body = (
          <>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="leading-normal">{t(`nav.${item.key}`)}</span>
            {!item.ready && (
              <span className="ml-auto rounded-full bg-ivory-100/5 px-1.5 text-[11px] leading-5 font-medium text-ivory-500">
                {t("soon")}
              </span>
            )}
          </>
        );
        const base = cn(
          "flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm whitespace-nowrap",
          layout === "column" ? "w-full" : "shrink-0",
        );
        return (
          <li key={item.key}>
            {item.ready ? (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-testid={`admin-nav-${item.key}`}
                className={cn(
                  base,
                  "transition-colors",
                  active
                    ? "bg-gold-500/10 font-medium text-gold-300"
                    : "text-ivory-100/70 hover:bg-ivory-100/5 hover:text-ivory-100",
                )}
              >
                {body}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                data-testid={`admin-nav-${item.key}`}
                className={cn(base, "cursor-default text-ivory-500")}
              >
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
