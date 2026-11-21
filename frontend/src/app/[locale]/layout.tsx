import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { AppProviders } from "@/components/layout/app-providers";
import { FlashToast } from "@/components/layout/flash-toast";
import { RememberedUiState } from "@/components/layout/remembered-ui-state";
import { pickMessages, SITE_CLIENT_MESSAGES } from "@/i18n/client-messages";
import { HTML_LANG, routing } from "@backend/i18n/routing";
import { shareMetadata } from "@backend/lib/seo/seo";
import { getEnv } from "@backend/env";
import { fontVariables } from "@/styles/fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await rootLocale();
  const t = await getTranslations("metadata");
  return {
    // GĐ7.3: relative URLs in metadata (canonical, hreflang, link previews) resolve against the site address.
    metadataBase: new URL(getEnv().APP_URL),
    title: { default: t("siteName"), template: `%s | ${t("siteName")}` },
    description: t("description"),
    // Pages without their own preview fields (pages override the whole set: metadata merges shallowly).
    ...(hasLocale(routing.locales, locale)
      ? shareMetadata({ locale, siteName: t("siteName"), title: t("siteName"), description: t("description") })
      : {}),
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0908",
  colorScheme: "dark light",
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();
  const [t, messages] = await Promise.all([getTranslations("common"), getMessages()]);

  return (
    // suppressHydrationWarning: the inline scripts may set data-sidebar / data-theme on <html> before React hydrates.
    <html lang={HTML_LANG[locale]} className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {/* Apply the remembered sidebar state and theme before first paint (no flash), also after a language switch. */}
        <RememberedUiState />
        {/* Only the translations client components read (GĐ7.3: not the whole file in every page). */}
        <NextIntlClientProvider messages={pickMessages(messages, SITE_CLIENT_MESSAGES)}>
          <AppProviders labels={{ close: t("close"), notifications: t("notifications") }}>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-80 focus:rounded-md focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-soot"
            >
              {t("skipToContent")}
            </a>
            {/* The shell lives in the route groups: (site) = store (components/layout/site-shell.tsx), admin = Admin area. */}
            {children}
            <FlashToast />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
