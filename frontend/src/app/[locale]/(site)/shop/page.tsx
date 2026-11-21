import { Info } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-grid";
import { ActiveFilters } from "@/components/shop/active-filters";
import { RememberShopQuery } from "@/components/shop/back-to-shop";
import { FilterMenu, type FilterOption } from "@/components/shop/filter-menu";
import { SORT_KEY, TYPE_KEY } from "@/components/shop/labels";
import { Pagination } from "@/components/shop/pagination";
import { PriceFilter } from "@/components/shop/price-filter";
import { ShopSearch } from "@/components/shop/shop-search";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { parseShopParams, priceSliderMax, SHOP_PAGE_SIZE, SHOP_SORTS, SHOP_TYPES, shopQuery, type ShopParams } from "@backend/lib/catalog/shop-params";
import { pageAlternates, shareMetadata } from "@backend/lib/seo/seo";
import { getShopFacets, listShopProducts, type ShopFacets } from "@backend/modules/product/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/shop">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const [t, tm] = await Promise.all([getTranslations("shop"), getTranslations("metadata")]);
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    // GĐ7.3: one canonical shop page per language (filters, sort and page are views of it).
    alternates: pageAlternates(locale, "/shop", routing.locales),
    ...shareMetadata({ locale, siteName: tm("siteName"), title, description, path: "/shop" }),
  };
}

/** Page frame (evondevKit shell.md): p-4 sm:p-6, content hugs the sidebar (no mx-auto), wide cap 1600px. */
const frame = "flex w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6";

/**
 * Store (evondevKit layouts/app/entity-grid.md). The page name is the <h1> in the top bar, so the content
 * starts with the toolbar: search + filter buttons on the left, result count + sort on the right, then the
 * applied-filter chips, the demo notice, the grid and the pagination row. Results depend on the query string
 * and stream in (Cache Components).
 */
export default async function ShopPage({ searchParams }: PageProps<"/[locale]/shop">) {
  const tc = await getTranslations("common");
  return (
    <Suspense
      fallback={
        <div className={frame}>
          <div className="h-11 md:h-10" />
          <ProductGridSkeleton label={tc("loading")} />
        </div>
      }
    >
      <ShopResults searchParams={searchParams} />
    </Suspense>
  );
}

async function ShopResults({ searchParams }: { searchParams: PageProps<"/[locale]/shop">["searchParams"] }) {
  const [raw, locale, t] = await Promise.all([searchParams, getLocale(), getTranslations("shop")]);
  const params = parseShopParams(raw);
  const [result, facets] = await Promise.all([listShopProducts(locale as Locale, params), getShopFacets(locale as Locale)]);
  const shown = { ...params, page: result.page };
  const from = result.total === 0 ? 0 : (result.page - 1) * SHOP_PAGE_SIZE + 1;
  const to = Math.min(result.page * SHOP_PAGE_SIZE, result.total);
  const hasDemo = result.items.some((p) => p.isDemoData);

  return (
    <div className={frame}>
      <RememberShopQuery query={shopQuery(shown)} />
      {/* Toolbar, two rows: search, then the filter buttons with sort at the far end. On phones the button row
          scrolls sideways with a faded right edge (responsive.md R10) so it is clear there is more. */}
      <div className="flex flex-col gap-3">
        <ShopSearch params={shown} />
        <div className="scrollbar-none -mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:[mask-image:none]">
          <Filters params={shown} facets={facets} />
          <div className="shrink-0 pr-6 md:ml-auto md:pr-0">
            <SortMenu params={shown} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-sans text-sm text-ivory-300" data-testid="shop-count">
          {t("resultCount", { count: result.total })}
        </h2>
        <ActiveFilters params={shown} facets={facets} />
      </div>

      {hasDemo && (
        <div role="status" className="flex gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-4">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ivory-500" />
          <p className="text-sm text-pretty text-ivory-100/80">{t("demoNotice")}</p>
        </div>
      )}

      {result.items.length > 0 ? (
        <ProductGrid products={result.items} />
      ) : (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/shop">{t("clearAll")}</Link>
            </Button>
          }
        />
      )}

      {result.total > 0 && (
        <Pagination
          params={shown}
          page={result.page}
          pageCount={result.pageCount}
          summary={t("showing", { from, to, total: result.total })}
        />
      )}
    </div>
  );
}

/** Type / genre / style dropdowns + price popover. Each option is a link built from the current params. */
async function Filters({ params, facets }: { params: ShopParams; facets: ShopFacets }) {
  const t = await getTranslations("shop");
  const all = t("all");
  const opts = <K extends "type" | "genre" | "style">(
    key: K,
    items: { value: NonNullable<ShopParams[K]>; label: string; count?: number }[],
  ): FilterOption[] => [
    { key: "all", label: all, query: shopQuery(params, { [key]: undefined }), selected: !params[key] },
    ...items.map((i) => ({
      key: String(i.value),
      label: i.label,
      count: i.count,
      query: shopQuery(params, { [key]: i.value }),
      selected: params[key] === i.value,
    })),
  ];
  const nameOf = (list: { slug: string; name: string }[], slug?: string) => (slug ? (list.find((x) => x.slug === slug)?.name ?? slug) : undefined);

  return (
    <>
      <FilterMenu
        label={t("type")}
        testId="filter-type"
        value={params.type ? t(`types.${TYPE_KEY[params.type]}`) : undefined}
        options={opts("type", SHOP_TYPES.map((v) => ({ value: v, label: t(`types.${TYPE_KEY[v]}`) })))}
      />
      <FilterMenu
        label={t("genre")}
        testId="filter-genre"
        value={nameOf(facets.genres, params.genre)}
        options={opts("genre", facets.genres.map((g) => ({ value: g.slug, label: g.name, count: g.count })))}
      />
      <FilterMenu
        label={t("style")}
        testId="filter-style"
        value={nameOf(facets.styles, params.style)}
        options={opts("style", facets.styles.map((s) => ({ value: s.slug, label: s.name, count: s.count })))}
      />
      <PriceFilter params={params} sliderMax={priceSliderMax(facets.highestPrice)} />
    </>
  );
}

async function SortMenu({ params }: { params: ShopParams }) {
  const t = await getTranslations("shop");
  const current = t(`sort.${SORT_KEY[params.sort]}`);
  return (
    <FilterMenu
      label={`${t("sortLabel")}: ${current}`}
      testId="shop-sort"
      options={SHOP_SORTS.map((s) => ({
        key: s,
        label: t(`sort.${SORT_KEY[s]}`),
        query: shopQuery(params, { sort: s }),
        selected: params.sort === s,
      }))}
    />
  );
}
