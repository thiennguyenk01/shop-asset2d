import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderTabs } from "@/components/admin/order-tabs";
import { TransferResolveButton } from "@/components/admin/transfer-resolve";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { parseTransferFilters, TRANSFER_STATES, type TransferState } from "@backend/lib/admin/transfer-rules";
import { cn } from "@/lib/cn";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getOpenTransferTotals, listUnmatchedTransfers } from "@backend/modules/payment/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTransfers");
  return { title: t("title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Bank transfers that settled nothing (DECISIONS #45: kept for an Admin, never granted automatically): no order code
 * in the memo, a wrong amount, or an order already closed. The Admin contacts the buyer, settles it outside the site
 * and marks it handled with a note (logged). Newest first, 20 per page.
 */
export default async function AdminTransfersPage({ params, searchParams }: PageProps<"/[locale]/admin/orders/transfers">) {
  const { locale } = await params;
  const t = await getTranslations("adminTransfers");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-pretty text-ivory-500">{t("intro")}</p>
        <p className="max-w-3xl text-sm text-pretty text-ivory-500">
          {t("manualHint")}{" "}
          <Link href="/admin/users" className="inline-flex items-center gap-1 text-gold-300 hover:underline">
            {t("manualLink")}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />}>
        <TransferList locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TransferList({ locale, searchParams }: { locale: Locale; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const raw = await searchParams;
  const filters = parseTransferFilters({ state: one(raw.state), page: one(raw.page) });
  const [list, open, t, ta, format] = await Promise.all([
    listUnmatchedTransfers(filters),
    getOpenTransferTotals(),
    getTranslations("adminTransfers"),
    getTranslations("adminOrders"),
    getFormatter(),
  ]);
  const href = (state: TransferState, page?: number) => ({
    pathname: "/admin/orders/transfers",
    query: { ...(state !== "open" ? { state } : {}), ...(page && page > 1 ? { page } : {}) },
  });
  const when = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <OrderTabs active="transfers" openTransfers={open.real.count + open.demo.count} />
      <section aria-label={t("openTitle")} className="grid gap-3 sm:grid-cols-2" data-testid="transfer-open-totals">
        <div className="flex flex-col gap-1 rounded-2xl border border-bronze-700 bg-ink-900 p-4">
          <span className="text-xs text-ivory-500">{t("openReal")}</span>
          <span className="text-lg font-semibold text-gold-300 tabular-nums">{formatVnd(open.real.amountVnd, locale)}</span>
          <span className="text-xs text-ivory-300 tabular-nums">{t("transfers", { count: open.real.count })}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-bronze-700 bg-ink-900 p-4">
          <span className="text-xs text-ivory-500">{t("openDemo")}</span>
          <span className="text-lg font-semibold text-ivory-100 tabular-nums">{formatVnd(open.demo.amountVnd, locale)}</span>
          <span className="text-xs text-ivory-300 tabular-nums">{t("transfers", { count: open.demo.count })}</span>
        </div>
      </section>

      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2" data-testid="transfer-filters">
        {TRANSFER_STATES.map((s) => (
          <Link
            key={s}
            href={href(s)}
            aria-current={filters.state === s ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-lg border px-3 text-sm transition-colors",
              filters.state === s ? "border-gold-500 bg-gold-500/10 text-gold-300" : "border-bronze-600 text-ivory-300 hover:text-ivory-100",
            )}
          >
            {t(`state.${s}`)}
          </Link>
        ))}
      </nav>

      <p className="text-xs text-ivory-500" data-testid="transfer-count">
        {t("transfers", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">
          {filters.state === "open" ? t("emptyOpen") : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900" data-testid="transfer-list">
          {list.items.map((x) => (
            <li key={x.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5" data-testid="transfer-row" data-reason={x.reason}>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-ivory-100 tabular-nums">{formatVnd(x.amountVnd, locale)}</span>
                  <Badge variant="neutral">{t(`reason.${x.reason}`)}</Badge>
                  {x.isDemo && <Badge variant="demo">{t("testBadge")}</Badge>}
                  {x.resolved && <Badge variant="free">{t("resolvedBadge")}</Badge>}
                </div>
                <p className="font-mono text-sm break-all text-ivory-300">“{x.content}”</p>
                <p className="text-xs text-ivory-500">
                  {when(x.at)} · {ta(`provider.${x.provider}` as "provider.DEMO")} · {t("account", { account: x.bankAccount })} · {t("txn", { id: x.externalId })}
                </p>
                {x.orderCode && (
                  <p className="text-xs text-ivory-300">
                    {t("orderFound")}{" "}
                    {x.orderExists ? (
                      <Link href={`/admin/orders/${x.orderCode}`} className="font-medium text-gold-300 tabular-nums hover:underline">
                        {x.orderCode}
                      </Link>
                    ) : (
                      <span className="tabular-nums">
                        {x.orderCode} ({t("orderMissing")})
                      </span>
                    )}
                  </p>
                )}
                {x.resolved && (
                  <p className="text-xs text-pretty text-ivory-300" data-testid="transfer-resolution">
                    {t("resolvedLine", { time: when(x.resolved.at), admin: x.resolved.by ?? "—" })}: {x.resolved.note}
                  </p>
                )}
              </div>
              {!x.resolved && (
                <div className="shrink-0">
                  <TransferResolveButton id={x.id} amount={formatVnd(x.amountVnd, locale)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {list.pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label={ta("page", { page: list.page, count: list.pageCount })}>
          {list.page > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={href(filters.state, list.page - 1)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                {ta("prev")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-ivory-500 tabular-nums">{ta("page", { page: list.page, count: list.pageCount })}</span>
          {list.page < list.pageCount ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={href(filters.state, list.page + 1)}>
                {ta("next")}
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
