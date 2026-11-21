import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getPathname } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { shopQuery, type ShopParams } from "@backend/lib/catalog/shop-params";

/**
 * Search box at the start of the shop toolbar (evondevKit input.md: same height as the filter buttons).
 * Search box inside the shop. Plain GET form; the other active filters (except q/page) are
 * carried as hidden fields so searching keeps the current category, type, etc.
 */
export async function ShopSearch({ params }: { params: ShopParams }) {
  const [t, locale] = await Promise.all([getTranslations("shop"), getLocale()]);
  const keep = shopQuery(params, { q: undefined });
  delete keep.page;

  return (
    <form role="search" action={getPathname({ href: "/shop", locale: locale as Locale })} className="relative w-full md:max-w-xl">
      <label htmlFor="shop-search" className="sr-only">
        {t("searchLabel")}
      </label>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        id="shop-search"
        name="q"
        type="search"
        defaultValue={params.q ?? ""}
        placeholder={t("searchPlaceholder")}
        className="h-11 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-11 pl-3.5 text-base text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25 md:h-10 md:text-sm"
      />
      <button
        type="submit"
        aria-label={t("searchSubmit")}
        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-ivory-500 hover:bg-ivory-100/5 hover:text-ivory-100"
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}
