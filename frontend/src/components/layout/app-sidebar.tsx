import { getTranslations } from "next-intl/server";
import { cacheLife } from "next/cache";
import { Suspense, type ReactNode } from "react";
import { MAIN_NAV, SUPPORT_NAV } from "./app-nav";
import { BrandLogo } from "./brand-logo";
import { SidebarNav } from "./sidebar-nav";

export async function getCopyrightYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/**
 * Group label: uppercase via CSS, muted. Collapsed: the text fades in place (row keeps its height so icons
 * never move) and a short dash centred on the icon column marks the group boundary (shell.md "Thu gọn").
 */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col first:mt-0">
      {title && (
        <h2 className="relative flex h-10 items-center px-3 text-xs font-medium tracking-wide whitespace-nowrap text-ivory-500 uppercase">
          <span className="transition-opacity duration-150 sidebar-collapsed:opacity-0">{title}</span>
          <span aria-hidden="true" className="absolute left-3 h-px w-4 bg-bronze-600 opacity-0 transition-opacity duration-150 sidebar-collapsed:opacity-100" />
        </h2>
      )}
      {children}
    </div>
  );
}

/**
 * Desktop dashboard sidebar (lg+), evondevKit shell.md: w-64 ↔ w-16 icon rail (toggle in the top bar).
 * Only the width animates; icons stay put (nav px-3 + link px-3 → icon centre at 32px, logo px-3 + 40px seal
 * → centre 32px) and text is clipped by the edge while fading. Collapsed, the head shows only the 仙 seal.
 */
export async function AppSidebar() {
  const [t, tf, year] = await Promise.all([getTranslations("nav"), getTranslations("footer"), getCopyrightYear()]);
  return (
    <aside
      data-testid="app-sidebar"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-bronze-700 bg-ink-900 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex sidebar-collapsed:w-16"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-bronze-700 px-3">
        <BrandLogo stacked />
      </div>
      <nav
        aria-label={t("mainLabel")}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-3 sidebar-collapsed:[scrollbar-width:none]"
      >
        <Suspense>
          <Group>
            <SidebarNav items={MAIN_NAV} withTooltip />
          </Group>
          <div className="mt-auto pt-4">
            <Group title={t("supportTitle")}>
              <SidebarNav items={SUPPORT_NAV} withTooltip />
            </Group>
          </div>
        </Suspense>
      </nav>
      {/* Fixed width so the text does not reflow while the rail narrows; it is clipped and faded instead. */}
      <p className="w-64 shrink-0 px-6 pt-2 pb-5 text-xs leading-relaxed text-ivory-500 transition-opacity duration-150 sidebar-collapsed:opacity-0">
        {tf("copyright", { year })}
      </p>
    </aside>
  );
}
