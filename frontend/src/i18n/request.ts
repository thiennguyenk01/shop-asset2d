import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "@backend/i18n/routing";

/**
 * Locale comes from the `[locale]` root segment via `next/root-params`.
 * Root params are not available in Server Actions / Route Handlers: there, pass the
 * locale explicitly, e.g. `getTranslations({ locale, namespace })`.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  let locale = explicit;
  if (!locale) {
    const fromRoute = await rootLocale();
    locale = hasLocale(routing.locales, fromRoute) ? fromRoute : routing.defaultLocale;
  }
  if (!hasLocale(routing.locales, locale)) locale = routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Ho_Chi_Minh",
  };
});
