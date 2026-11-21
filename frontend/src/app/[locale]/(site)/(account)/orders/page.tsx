import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { listOrdersForUser } from "@backend/modules/order/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders"), robots: { index: false } };
}

/** Order history (CLAUDE.md §5.8 "Lịch sử đơn hàng"). Name in the top bar (<h1>); one card listing the orders. */
const frame = "flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6";
const card = "rounded-2xl border border-bronze-700 bg-ink-900";
const SHOWN_TITLES = 2;

export default async function OrdersPage({ params, searchParams }: PageProps<"/[locale]/orders">) {
  const { locale } = await params;
  const tc = await getTranslations("common");
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <div role="status" className={`h-96 animate-pulse ${card}`}>
            <span className="sr-only">{tc("loading")}</span>
          </div>
        }
      >
        <OrdersContent locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrdersContent({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/orders">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/orders" } }, locale });
  const raw = (await searchParams).page;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const [list, t, tr, tc, te, format] = await Promise.all([
    listOrdersForUser(user!.id, locale, requested),
    getTranslations("orders"),
    getTranslations("checkout.result"),
    getTranslations("common"),
    getTranslations("extraDownloads"),
    getFormatter(),
  ]);

  if (list.total === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyText")}
        action={
          <Button asChild>
            <Link href="/shop?type=premium">
              <ShoppingBag aria-hidden="true" className="size-4" />
              {t("browsePremium")}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <p className="text-sm text-pretty text-ivory-300">{t("intro")}</p>
      <section aria-label={t("listLabel", { count: list.total })} className={card}>
        <ul className="divide-y divide-bronze-700" data-testid="order-list">
          {list.items.map((o) => {
            // A "more downloads" line reads "<pack> · +2 downloads" (step 4.6).
            const titles = o.lines.map((l) => (l.extraDownloads ? te("line", { title: l.title, count: l.extraDownloads }) : l.title));
            const shown = titles.slice(0, SHOWN_TITLES).join(", ");
            const more = titles.length - SHOWN_TITLES;
            return (
              <li key={o.code}>
                <Link
                  href={`/orders/${o.code}`}
                  aria-label={t("viewOrder", { code: o.code })}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ivory-100/5 sm:px-5"
                  data-testid="order-row"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium whitespace-nowrap text-ivory-100 tabular-nums">{o.code}</span>
                    <span className="text-sm text-pretty text-ivory-300">
                      {shown}
                      {more > 0 && <span className="text-ivory-500"> {t("more", { count: more })}</span>}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-ivory-500">{format.dateTime(o.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                      {o.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                      <Badge variant={o.status === "PAID" ? "free" : "neutral"}>{tr(`status.${o.status}`)}</Badge>
                    </div>
                  </div>
                  <span className="shrink-0 self-start text-sm font-semibold text-ivory-100 tabular-nums">{formatVnd(o.totalVnd, locale)}</span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ivory-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      {list.pageCount > 1 && (
        <nav aria-label={t("pageOf", { page: list.page, count: list.pageCount })} className="flex items-center justify-between gap-3">
          <PageLink page={list.page - 1} disabled={list.page <= 1} label={t("previous")} icon="prev" />
          <span className="text-sm text-ivory-300 tabular-nums">{t("pageOf", { page: list.page, count: list.pageCount })}</span>
          <PageLink page={list.page + 1} disabled={list.page >= list.pageCount} label={t("next")} icon="next" />
        </nav>
      )}
    </>
  );
}

function PageLink({ page, disabled, label, icon }: { page: number; disabled: boolean; label: string; icon: "prev" | "next" }) {
  const content = (
    <>
      {icon === "prev" && <ChevronLeft aria-hidden="true" className="size-4" />}
      {label}
      {icon === "next" && <ChevronRight aria-hidden="true" className="size-4" />}
    </>
  );
  if (disabled) {
    return (
      <Button variant="ghost" size="sm" disabled>
        {content}
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="sm">
      <Link href={{ pathname: "/orders", query: page > 1 ? { page: String(page) } : {} }}>{content}</Link>
    </Button>
  );
}
