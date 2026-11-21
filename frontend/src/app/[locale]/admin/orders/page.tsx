import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderTabs } from "@/components/admin/order-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import {
  ADMIN_ORDER_STATUSES,
  parseAdminOrderFilters,
  type MoneyCount,
  type OrderMoneySummary,
} from "@backend/lib/admin/order-rules";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getAdminOrderMoney, listAdminOrders } from "@backend/modules/order/admin-service";
import { getOpenTransferTotals } from "@backend/modules/payment/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOrders");
  return { title: t("listTitle") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Admin order list (GĐ5.4): search by code / email, status filter (plain GET form), newest first; 7 per page
 * (user choice 2026-11-21). Above the list, the money of the orders the filters match (finance tiles, no
 * chart). A tab leads to the bank transfers that settled nothing (DECISIONS #45).
 */
export default async function AdminOrdersPage({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = await params;
  const t = await getTranslations("adminOrders");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("listTitle")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("listIntro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <OrderList locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderList({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const raw = await searchParams;
  const { q, status, page } = parseAdminOrderFilters({ q: one(raw.q), status: one(raw.status), page: one(raw.page) });
  const [list, money, transfers, t, tr, tc, format] = await Promise.all([
    listAdminOrders({ q, status }, locale, page),
    getAdminOrderMoney({ q, status }),
    getOpenTransferTotals(),
    getTranslations("adminOrders"),
    getTranslations("checkout.result"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const filtered = !!(status || q);
  const pageHref = (p: number) => ({
    pathname: "/admin/orders",
    query: { ...(q ? { q } : {}), ...(status ? { status } : {}), page: p },
  });

  return (
    <>
      <OrderTabs active="orders" openTransfers={transfers.real.count + transfers.demo.count} />
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" data-testid="admin-order-filters">
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
            className="h-10 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-3 pl-9 text-sm text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25"
          />
        </label>
        <SelectMenu
          name="status"
          defaultValue={status ?? ""}
          ariaLabel={t("col.status")}
          options={[
            { value: "", label: t("statusAll") },
            ...ADMIN_ORDER_STATUSES.map((x) => ({ value: x, label: tr(`status.${x}`) })),
          ]}
          testId="filter-status"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          {t("filter")}
        </Button>
      </form>

      <OrderMoney money={money} filtered={filtered} locale={locale} />

      <p className="text-xs text-ivory-500" data-testid="admin-order-count">
        {t("count", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <ul
          className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900"
          data-testid="admin-order-list"
        >
          {list.items.map((o) => (
            <li key={o.code}>
              <Link
                href={`/admin/orders/${o.code}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ivory-100/5 sm:gap-4 sm:px-5"
                data-testid="admin-order-row"
                data-code={o.code}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium text-ivory-100 tabular-nums">{o.code}</span>
                  <span className="text-xs break-all text-ivory-500">
                    <span className="sr-only">{t("col.buyer")}: </span>
                    {o.buyerEmail} · {format.dateTime(o.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="text-xs text-pretty text-ivory-300">
                    {o.lines
                      .map((l) =>
                        l.extraDownloads ? t("extraLine", { title: l.title, count: l.extraDownloads }) : l.title,
                      )
                      .join(" · ")}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Badge
                      variant={o.status === "PAID" ? "free" : "neutral"}
                      data-testid="admin-order-status"
                      data-status={o.status}
                    >
                      {tr(`status.${o.status}`)}
                    </Badge>
                    {o.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-medium text-ivory-100 tabular-nums">
                  {formatVnd(o.totalVnd, locale)}
                </span>
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

/**
 * Finance figures of the orders the filters match, on every page (user request 2026-11-21; no chart). Real orders
 * only; Demo money is kept out, like the statistics page (DECISIONS #36).
 */
async function OrderMoney({ money, filtered, locale }: { money: OrderMoneySummary; filtered: boolean; locale: Locale }) {
  const t = await getTranslations("adminOrders.money");
  const vnd = (n: number) => formatVnd(n, locale);
  const { real } = money;
  const box = "flex min-w-0 flex-col gap-0.5 rounded-xl border border-bronze-700 bg-ink-950/40 p-3";
  const tile = (key: "paid" | "refunded" | "pending" | "unpaid", c: MoneyCount, tone = "text-ivory-100") => (
    <div className={box} data-testid={`money-${key}`}>
      <dt className="text-xs text-ivory-500">{t(key)}</dt>
      <dd className={`text-base font-semibold tabular-nums ${tone}`}>{vnd(c.totalVnd)}</dd>
      <dd className="text-xs text-ivory-500 tabular-nums">{t("orders", { count: c.orders })}</dd>
    </div>
  );
  return (
    <section aria-labelledby="money-title" className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-4 sm:p-5" data-testid="admin-order-money">
      <header className="flex flex-col gap-0.5">
        <h2 id="money-title" className="text-base font-semibold text-ivory-100">
          {t("title")}
        </h2>
        <p className="text-xs text-pretty text-ivory-500">{filtered ? t("introFiltered") : t("intro")}</p>
      </header>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tile("paid", real.paid, "text-gold-300")}
        {tile("refunded", real.refunded)}
        {tile("pending", real.pending)}
        {tile("unpaid", real.unpaid)}
        <div className={box} data-testid="money-average">
          <dt className="text-xs text-ivory-500">{t("average")}</dt>
          <dd className="text-base font-semibold text-ivory-100 tabular-nums">{vnd(real.averagePaidVnd)}</dd>
        </div>
        <div className={box} data-testid="money-discount">
          <dt className="text-xs text-ivory-500">{t("discount")}</dt>
          <dd className="text-base font-semibold text-ivory-100 tabular-nums">{vnd(real.discountVnd)}</dd>
        </div>
      </dl>
    </section>
  );
}
