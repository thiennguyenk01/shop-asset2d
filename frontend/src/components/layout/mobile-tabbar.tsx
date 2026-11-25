"use client";

import { Ellipsis, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Link, usePathname } from "@backend/i18n/navigation";
import { LEGAL_PAGES } from "@backend/lib/info-pages";
import { CartBadge } from "@/components/cart/cart-count";
import { cn } from "@/lib/cn";
import { isNavActive, MORE_NAV, SUPPORT_NAV, TAB_NAV } from "./app-nav";
import { LegalLinks } from "./legal-links";
import { NavIcon } from "./nav-icon";
import { SidebarNav } from "./sidebar-nav";

/**
 * Each tab is a whole-cell hit area: icon size-5 over a one-line text-xs label (evondevKit shell.md "Thanh điều
 * hướng dưới"). Six cells since Premium joined the bar (2026-11-20): below 360px wide the label drops to 11px so
 * "Cửa hàng" still fits on one line.
 */
const tab =
  "flex h-full w-full flex-col items-center justify-center gap-1 text-xs whitespace-nowrap outline-hidden transition-colors max-[359px]:text-[0.6875rem]";

/**
 * Mobile bottom tab bar (< lg). Height = CSS variable --tabbar-h (globals.css), which pads <main> and lifts
 * the product section bar and toasts above it. The active tab is accent-coloured (icon + label), with no
 * background and no bar. "More" opens a bottom sheet with the remaining links and the copyright line.
 */
export function MobileTabbar({ copyright }: { copyright: string }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tcart = useTranslations("cart");
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [open, setOpen] = useState(false);
  const moreActive =
    [...MORE_NAV, ...SUPPORT_NAV].some((i) => isNavActive(i.href, pathname, query)) || LEGAL_PAGES.some((p) => pathname === `/${p}`);

  return (
    <nav
      aria-label={t("mainLabel")}
      data-testid="mobile-tabbar"
      className="fixed inset-x-0 bottom-0 z-50 h-(--tabbar-h) border-t border-bronze-700 bg-ink-900 lg:hidden"
    >
      <ul className="grid h-full grid-cols-6">
        {TAB_NAV.map((item) => {
          const active = isNavActive(item.href, pathname, query);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(tab, active ? "font-medium text-gold-300" : "text-ivory-500 hover:text-ivory-100")}
              >
                <span className="relative">
                  <NavIcon name={item.icon} className="size-5" />
                  {item.key === "cart" && <CartBadge label={(n) => tcart("badge", { count: n })} className="absolute -top-2 -right-3" />}
                </span>
                {t(item.key)}
              </Link>
            </li>
          );
        })}
        <li>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              data-testid="tabbar-more"
              className={cn(tab, "cursor-pointer", moreActive ? "font-medium text-gold-300" : "text-ivory-500 hover:text-ivory-100")}
            >
              <Ellipsis aria-hidden="true" className="size-5" />
              {t("more")}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-60 bg-black/40 lg:hidden" />
              <Dialog.Content className="fixed inset-x-0 bottom-0 z-60 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-bronze-700 bg-ink-850 px-3 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] focus:outline-none lg:hidden">
                <div className="flex items-center justify-between px-3">
                  <Dialog.Title className="text-base font-semibold text-ivory-100">{t("more")}</Dialog.Title>
                  <Dialog.Description className="sr-only">{t("mainLabel")}</Dialog.Description>
                  <Dialog.Close
                    aria-label={tc("close")}
                    className="grid size-8 cursor-pointer place-items-center rounded-lg text-ivory-500 hover:bg-ivory-100/5 hover:text-ivory-100"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </Dialog.Close>
                </div>
                <SidebarNav items={MORE_NAV} onNavigate={() => setOpen(false)} />
                <div>
                  <p className="flex h-10 items-center px-3 text-xs font-medium tracking-wide text-ivory-500 uppercase">{t("supportTitle")}</p>
                  <SidebarNav items={SUPPORT_NAV} onNavigate={() => setOpen(false)} />
                </div>
                <div className="flex flex-col gap-1 px-3">
                  <LegalLinks onNavigate={() => setOpen(false)} />
                  <p className="text-xs text-ivory-500">{copyright}</p>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </li>
      </ul>
    </nav>
  );
}
