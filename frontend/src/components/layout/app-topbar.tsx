import { UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { TopbarCartLink } from "@/components/cart/topbar-cart-link";
import { Seal } from "@/components/ui/seal";
import { Link } from "@backend/i18n/navigation";
import { AccountButton } from "./account-button";
import { LocaleSwitcher } from "./locale-switcher";
import { NotificationsButton } from "./notifications-button";
import { SidebarToggle } from "./sidebar-toggle";
import { ThemeToggle } from "./theme-toggle";
import { TopbarTitle } from "./topbar-title";

/** Icon-only header button (evondevKit shell.md "Nhóm nút bên phải thanh header"): ghost, h-9, rounded-lg. */
const iconLink =
  "grid size-9 place-items-center rounded-lg text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100";

/**
 * Dashboard top bar (h-16, one hairline below). Left: page title from the route (mobile: the 仙 seal first,
 * the full brand lives in the desktop sidebar). Right: theme, language, cart (desktop — mobile has it in the tab
 * bar), notifications, account. Icon-only items carry their name in aria-label + title.
 */
export async function AppTopbar() {
  const [t, tb] = await Promise.all([getTranslations("header"), getTranslations("brand")]);
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-bronze-700 bg-ink-950/90 backdrop-blur-md">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6 lg:pl-4">
        <SidebarToggle labels={{ collapse: t("collapseSidebar"), expand: t("expandSidebar") }} />
        <Link href="/shop" aria-label={tb("homeLink")} className="shrink-0 lg:hidden">
          <Seal glyphs="仙" size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <Suspense>
            <TopbarTitle />
          </Suspense>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle labels={{ toLight: t("themeLight"), toDark: t("themeDark") }} />
          <Suspense fallback={<span className="h-9 w-16" />}>
            <LocaleSwitcher />
          </Suspense>
          <TopbarCartLink />
          <NotificationsButton />
          {/* Reads the session: streams in; the placeholder keeps the same size so the bar does not shift. */}
          <Suspense
            fallback={
              <span className={iconLink} aria-hidden="true">
                <UserRound className="size-5" />
              </span>
            }
          >
            <AccountButton />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
