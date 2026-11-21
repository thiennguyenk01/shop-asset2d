import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { NewPackButton } from "@/components/admin/product-status-panel";
import { ProductThumb } from "@/components/product/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { listAdminProducts } from "@backend/modules/product/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminProducts");
  return { title: t("listTitle") };
}

type Search = { q?: string; status?: string; type?: string; page?: string };
const STATUSES = ["DRAFT", "PUBLISHED", "HIDDEN"] as const;
const TYPES = ["FREE", "PREMIUM"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Admin pack list (GĐ5.2): search + status / type filters (plain GET form), 20 per page, newest change first. */
export default async function AdminProductsPage({ params, searchParams }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  const t = await getTranslations("adminProducts");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-ivory-100">{t("listTitle")}</h1>
          <p className="text-sm text-pretty text-ivory-500">{t("listIntro")}</p>
        </div>
        <NewPackButton label={t("new")} />
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />}>
        <ProductList locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProductList({ locale, searchParams }: { locale: Locale; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const raw = await searchParams;
  const s: Search = { q: one(raw.q), status: one(raw.status), type: one(raw.type), page: one(raw.page) };
  const status = STATUSES.find((x) => x === s.status);
  const type = TYPES.find((x) => x === s.type);
  const q = s.q?.slice(0, 80) ?? "";
  const [list, t, tc, tp, format] = await Promise.all([
    listAdminProducts({ status, type, q }, locale, Number(s.page ?? 1)),
    getTranslations("adminProducts"),
    getTranslations("common"),
    getTranslations("product"),
    getFormatter(),
  ]);
  const filtered = !!(status || type || q);
  const pageHref = (page: number) => ({ pathname: "/admin/products", query: { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(type ? { type } : {}), page } });

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" data-testid="admin-product-filters">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">{t("search")}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ivory-500" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-10 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-3 pl-9 text-sm text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25"
          />
        </label>
        <SelectMenu
          name="status"
          defaultValue={status ?? ""}
          ariaLabel={t("col.status")}
          options={[{ value: "", label: t("statusAll") }, ...STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) }))]}
          testId="filter-status"
        />
        <SelectMenu
          name="type"
          defaultValue={type ?? ""}
          ariaLabel={t("typeLabel")}
          options={[{ value: "", label: t("typeAll") }, ...TYPES.map((x) => ({ value: x, label: t(`type.${x}`) }))]}
          testId="filter-type"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          {t("filter")}
        </Button>
      </form>

      <p className="text-xs text-ivory-500" data-testid="admin-product-count">
        {t("count", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">{filtered ? t("emptyFiltered") : t("empty")}</p>
      ) : (
        <ul className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900" data-testid="admin-product-list">
          {list.items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/products/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ivory-100/5 sm:gap-4 sm:px-5"
                data-testid="admin-product-row"
                data-slug={p.slug}
              >
                <div className="w-16 shrink-0 overflow-hidden rounded-lg sm:w-20">
                  <ProductThumb thumbnail={p.thumbnail} alt="" demoLabel={tc("demo")} noImageLabel={tp("noImage")} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-pretty text-ivory-100">{p.title}</span>
                  <span className="text-xs break-all text-ivory-500">{p.slug}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant={p.status === "PUBLISHED" ? "free" : "neutral"}>{t(`status.${p.status}`)}</Badge>
                    <Badge variant={p.type === "FREE" ? "free" : "premium"}>{t(`type.${p.type}`)}</Badge>
                    {p.isFeatured && <Badge variant="neutral">{t("featured")}</Badge>}
                    {p.isDemoData && <Badge variant="demo">{t("demo")}</Badge>}
                    {p.missingLocales.length > 0 && <Badge variant="neutral">{t(p.status === "PUBLISHED" ? "hiddenIn" : "missing", { locales: p.missingLocales.map((l) => l.toUpperCase()).join(", ") })}</Badge>}
                    {!p.hasFile && <Badge variant="neutral">{t("noFile")}</Badge>}
                  </span>
                </div>
                <dl className="hidden shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs md:grid">
                  <dt className="text-ivory-500">{t("col.price")}</dt>
                  <dd className="text-right font-medium text-ivory-100 tabular-nums">{p.type === "FREE" ? tc("freePrice") : formatVnd(p.priceVnd, locale)}</dd>
                  <dt className="text-ivory-500">{t("col.sections")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">{p.sectionCount}</dd>
                  <dt className="text-ivory-500">{p.type === "FREE" ? t("col.downloads") : t("col.sales")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">{format.number(p.type === "FREE" ? p.downloadCount : p.salesCount)}</dd>
                  <dt className="text-ivory-500">{t("col.updated")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">{format.dateTime(p.updatedAt, { dateStyle: "short" })}</dd>
                </dl>
                <span className="shrink-0 text-sm font-medium text-ivory-100 tabular-nums md:hidden">{p.type === "FREE" ? tc("freePrice") : formatVnd(p.priceVnd, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label={t("page", { page: list.page, count: list.pageCount })}>
          {list.page > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref(list.page - 1)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                {t("prev")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-ivory-500 tabular-nums">{t("page", { page: list.page, count: list.pageCount })}</span>
          {list.page < list.pageCount ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref(list.page + 1)}>
                {t("next")}
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
