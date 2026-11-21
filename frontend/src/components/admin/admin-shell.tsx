import { ArrowLeft, Bell, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AccountButton } from "@/components/layout/account-button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Seal } from "@/components/ui/seal";
import { Link } from "@backend/i18n/navigation";
import { AdminAttention } from "./admin-attention";
import { AdminNavList } from "./admin-nav-list";

/**
 * Admin area shell (decision "Admin (GĐ5)": its own area, same colours as the store). Desktop: sidebar with the
 * seal + "Admin", the menu and "Back to store". Mobile: top bar + the menu as a sideways strip. Only rendered
 * after the admin layout has confirmed the visitor is an Admin.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const [t, th] = await Promise.all([getTranslations("admin"), getTranslations("header")]);
  const back = (
    <Link
      href="/shop"
      className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100"
      data-testid="admin-back-to-store"
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      {t("backToStore")}
    </Link>
  );
  return (
    <div className="flex min-h-dvh" data-testid="admin-shell">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-bronze-700 bg-ink-900 lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-bronze-700 px-3">
          <Seal glyphs="仙" size="sm" />
          <span className="font-heading text-lg text-ivory-100">{t("title")}</span>
        </div>
        <nav aria-label={t("navLabel")} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
          <Suspense>
            <AdminNavList layout="column" />
          </Suspense>
          <div className="mt-auto pt-4">{back}</div>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-bronze-700 bg-ink-950/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <span className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
              <Seal glyphs="仙" size="sm" />
              <span className="font-heading text-lg text-ivory-100">{t("title")}</span>
            </span>
            <span className="hidden flex-1 lg:block" />
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle labels={{ toLight: th("themeLight"), toDark: th("themeDark") }} />
              <Suspense fallback={<span className="h-9 w-16" />}>
                <LocaleSwitcher />
              </Suspense>
              <Suspense
                fallback={
                  <span className="grid size-9 place-items-center rounded-lg text-ivory-100/70" aria-hidden="true">
                    <Bell className="size-5" />
                  </span>
                }
              >
                <AdminAttention />
              </Suspense>
              <Suspense
                fallback={
                  <span className="grid size-9 place-items-center rounded-lg text-ivory-100/70" aria-hidden="true">
                    <UserRound className="size-5" />
                  </span>
                }
              >
                <AccountButton />
              </Suspense>
            </div>
          </div>
          <nav aria-label={t("navLabel")} className="border-t border-bronze-700 lg:hidden">
            <Suspense>
              <AdminNavList layout="row" />
            </Suspense>
          </nav>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <div className="border-t border-bronze-700 px-4 py-2 lg:hidden">{back}</div>
      </div>
    </div>
  );
}
