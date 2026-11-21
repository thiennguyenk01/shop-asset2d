import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { CartCountServer } from "@/components/cart/cart-count-server";
import { AppSidebar, getCopyrightYear } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { BackToTop } from "@/components/layout/back-to-top";
import { ContactChat } from "@/components/layout/contact-chat";
import { MobileTabbar } from "@/components/layout/mobile-tabbar";

/**
 * The store's dashboard shell (CLAUDE.md §13): sidebar (lg+) | top bar + content; bottom tab bar on mobile;
 * back-to-top + contact chat; cart badge count. Used by the (site) route group and by the 404 page, so
 * every store page and every "not found" (including /admin for non-admins) looks the same. The Admin area
 * (app/[locale]/admin) has its own shell.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const [tf, year] = await Promise.all([getTranslations("footer"), getCopyrightYear()]);
  return (
    <>
      <div className="flex min-h-dvh">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar />
          <main id="main" className="flex-1 pb-(--tabbar-h)">
            {children}
          </main>
        </div>
      </div>
      <Suspense>
        <MobileTabbar copyright={tf("copyright", { year })} />
      </Suspense>
      <BackToTop />
      <ContactChat />
      {/* Cart badge count: reads the session / cart cookie, so it streams in. */}
      <Suspense>
        <CartCountServer />
      </Suspense>
    </>
  );
}
