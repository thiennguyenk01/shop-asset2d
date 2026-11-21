import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { COUPON_FILTER_STATES, parseAdminCouponFilters, type CouponState } from "@backend/lib/admin/coupon-rules";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { listAdminCoupons } from "@backend/modules/coupon/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminCoupons");
  return { title: t("listTitle") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const stateVariant = (s: CouponState) => (s === "active" ? "free" : "neutral");

/** Admin coupon list (GĐ5.6): search by code, state filter (plain GET form), 20 per page, newest first. */
export default async function AdminCouponsPage({ params, searchParams }: PageProps<"/[locale]/admin/coupons">) {
  const t = await getTranslations("adminCoupons");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-ivory-100">{t("listTitle")}</h1>
          <p className="text-sm text-pretty text-ivory-500">{t("listIntro")}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/coupons/new" data-testid="coupon-new">
            <Plus aria-hidden="true" className="size-4" />
            {t("new")}
          </Link>
        </Button>
      </header>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <CouponList params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CouponList({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  const locale = raw as Locale;
  const { q, state, page } = parseAdminCouponFilters({ q: one(sp.q), state: one(sp.state), page: one(sp.page) });
  const [list, t, tc, format] = await Promise.all([
    listAdminCoupons({ q, state }, page),
    getTranslations("adminCoupons"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const filtered = !!(q || state);
  const pageHref = (p: number) => ({
    pathname: "/admin/coupons",
    query: { ...(q ? { q } : {}), ...(state ? { state } : {}), page: p },
  });
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" data-testid="coupon-filters">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">{t("search")}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ivory-500"
          />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-10 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-3 pl-9 text-sm text-ivory-100 uppercase outline-hidden placeholder:text-ivory-500 placeholder:normal-case focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25"
          />
        </label>
        <SelectMenu
          name="state"
          defaultValue={state ?? ""}
          ariaLabel={t("stateLabel")}
          options={[
            { value: "", label: t("stateAll") },
            ...COUPON_FILTER_STATES.map((x) => ({ value: x, label: t(`filter.${x}`) })),
          ]}
          testId="filter-state"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          {t("filter.submit")}
        </Button>
      </form>

      <p className="text-xs text-ivory-500" data-testid="coupon-count">
        {t("count", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <ul
          className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900"
          data-testid="coupon-list"
        >
          {list.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/coupons/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ivory-100/5 sm:gap-4 sm:px-5"
                data-testid="coupon-row"
                data-code={c.code}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold tracking-wide break-all text-ivory-100">{c.code}</span>
                  <span className="text-xs text-ivory-500">
                    {c.kind === "PERCENT"
                      ? t("valueText.PERCENT", { value: c.value })
                      : t("valueText.FIXED", { amount: formatVnd(c.value, locale) })}
                    {c.minTotalVnd > 0 && ` · ${t("fromTotal", { amount: formatVnd(c.minTotalVnd, locale) })}`}
                    {c.endsAt && ` · ${t("until", { date: date(c.endsAt) })}`}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant={stateVariant(c.state)} data-testid="coupon-state" data-state={c.state}>
                      {t(`state.${c.state}`)}
                    </Badge>
                    {c.code.startsWith("DEMO") && <Badge variant="demo">{tc("demo")}</Badge>}
                  </span>
                </div>
                <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-ivory-500">{t("col.used")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">
                    {c.maxUses === null
                      ? format.number(c.usedCount)
                      : `${format.number(c.usedCount)} / ${format.number(c.maxUses)}`}
                  </dd>
                  <dt className="text-ivory-500">{t("col.perUser")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">
                    {c.maxUsesPerUser === null ? t("noLimit") : format.number(c.maxUsesPerUser)}
                  </dd>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label={t("page", { page: list.page, count: list.pageCount })}
        >
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
          <span className="text-xs text-ivory-500 tabular-nums">
            {t("page", { page: list.page, count: list.pageCount })}
          </span>
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
