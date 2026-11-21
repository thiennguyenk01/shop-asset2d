import { X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { activeFilters, shopQuery, type ShopParams, type ShopType } from "@backend/lib/catalog/shop-params";
import { formatVnd } from "@backend/lib/format";
import type { ShopFacets } from "@backend/modules/product/queries";
import { TYPE_KEY } from "./labels";

/**
 * Applied-filter chips (evondevKit small-controls.md "Chip lọc đang áp dụng"): each chip is a "remove this
 * filter" button — outline, no accent fill — then a text "Clear all". Shown next to the result count.
 */
export async function ActiveFilters({ params, facets }: { params: ShopParams; facets: ShopFacets }) {
  const filters = activeFilters(params);
  if (filters.length === 0) return null;
  const [t, locale] = await Promise.all([getTranslations("shop"), getLocale()]);
  const vnd = (n: number) => formatVnd(n, locale as Locale);

  const label = (key: string, value: string): string => {
    switch (key) {
      case "q":
        return t("searchFor", { q: value });
      case "genre":
        return facets.genres.find((g) => g.slug === value)?.name ?? value;
      case "style":
        return facets.styles.find((s) => s.slug === value)?.name ?? value;
      case "type":
        return t(`types.${TYPE_KEY[value as ShopType]}`);
      case "price": {
        const { min, max } = params;
        if (min !== undefined && max !== undefined) return t("priceFilter.range", { min: vnd(min), max: vnd(max) });
        return min !== undefined ? t("priceFilter.from", { min: vnd(min) }) : t("priceFilter.upTo", { max: vnd(max ?? 0) });
      }
      default:
        return value;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{t("activeFilters")}</span>
      {filters.map(({ key, value, remove }) => {
        const name = label(key, value);
        return (
          <Link
            key={key}
            href={{ pathname: "/shop", query: shopQuery(params, remove) }}
            aria-label={t("removeFilter", { name })}
            className="inline-flex h-8 max-w-60 shrink-0 items-center gap-1 rounded-full border border-bronze-600 pr-2 pl-3 text-sm text-ivory-100 transition-colors hover:bg-ivory-100/5"
          >
            <span className="truncate leading-normal">{name}</span>
            <X aria-hidden="true" className="size-3.5 shrink-0 text-ivory-500" />
          </Link>
        );
      })}
      <Link href="/shop" className="inline-flex h-8 items-center px-1 text-sm text-ivory-500 underline-offset-4 hover:text-ivory-100 hover:underline">
        {t("clearAll")}
      </Link>
    </div>
  );
}
