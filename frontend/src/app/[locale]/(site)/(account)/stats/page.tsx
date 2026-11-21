import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import type { OrderStatus } from "@backend/lib/payment/rules";
import { getCurrentUser } from "@backend/auth/current-user";
import { getAccountStats, type AccountStats } from "@backend/modules/stats/account-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("stats"), robots: { index: false } };
}

/** A customer's own numbers (account menu → "Thống kê"). Name in the top bar (<h1>). */
const frame = "@container flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6";
const card = "rounded-2xl border border-bronze-700 bg-ink-900";

export default async function StatsPage({ params }: PageProps<"/[locale]/stats">) {
  const { locale } = await params;
  const tc = await getTranslations("common");
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{tc("loading")}</span>
            <div className="grid grid-cols-2 gap-3 @[56rem]:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`h-28 animate-pulse ${card}`} />
              ))}
            </div>
          </div>
        }
      >
        <StatsContent locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function StatsContent({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/stats" } }, locale });
  const [stats, t, format] = await Promise.all([getAccountStats(user!.id, locale), getTranslations("stats"), getFormatter()]);
  const { library, downloads, spending } = stats;
  const vnd = (v: number) => formatVnd(v, locale);

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-pretty text-ivory-300">{t("intro")}</p>
        {stats.memberSince && <p className="text-xs text-ivory-500">{t("memberSince", { date: format.dateTime(stats.memberSince, { dateStyle: "long" }) })}</p>}
      </header>

      <section aria-label={t("intro")} className="grid grid-cols-2 gap-3 @[56rem]:grid-cols-4" data-testid="stat-tiles">
        <StatTile
          testId="stat-library"
          label={t("library")}
          value={format.number(library.total)}
          sub={t("librarySub", { free: library.free, purchased: library.purchased }) + (library.gifted > 0 ? t("libraryGifted", { count: library.gifted }) : "")}
        />
        <StatTile testId="stat-downloads" label={t("downloads")} value={format.number(downloads.total)} sub={t("downloadsSub", { count: downloads.recent })} />
        <StatTile
          testId="stat-spent"
          label={t("spent")}
          value={vnd(spending.realVnd)}
          sub={t("spentSub", { count: spending.realOrders })}
          note={spending.demoOrders > 0 ? t("spentDemo", { amount: vnd(spending.demoVnd), count: spending.demoOrders }) : undefined}
        />
        <StatTile
          testId="stat-savings"
          label={t("savings")}
          value={vnd(spending.couponSavingsVnd)}
          sub={t("savingsSub")}
          note={spending.demoCouponSavingsVnd > 0 ? t("savingsDemo", { amount: vnd(spending.demoCouponSavingsVnd) }) : undefined}
        />
      </section>

      <div className="grid items-start gap-4 @[56rem]:grid-cols-2">
        <TopPacksCard packs={downloads.topPacks} />
        <OrdersCard orders={stats.orders} locale={locale} />
      </div>
    </>
  );
}

function StatTile({ label, value, sub, note, testId }: { label: string; value: string; sub: string; note?: string; testId: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 p-4 ${card}`} data-testid={testId}>
      <p className="text-sm text-ivory-300">{label}</p>
      {/* Proportional figures for a standalone value (dataviz: tabular only in columns). */}
      <p className="text-2xl font-semibold text-ivory-100 [overflow-wrap:anywhere]" data-testid={`${testId}-value`}>
        {value}
      </p>
      <p className="text-xs text-pretty text-ivory-500">{sub}</p>
      {note && <p className="text-xs text-pretty text-ivory-500">{note}</p>}
    </div>
  );
}

async function TopPacksCard({ packs }: { packs: AccountStats["downloads"]["topPacks"] }) {
  const t = await getTranslations("stats");
  const max = Math.max(1, ...packs.map((p) => p.count));
  return (
    <section aria-labelledby="stats-top" className={`flex flex-col gap-3 p-5 ${card}`} data-testid="top-packs">
      <h2 id="stats-top" className="font-sans text-base font-semibold text-ivory-100">
        {t("topTitle")}
      </h2>
      {packs.length === 0 ? (
        <p className="text-sm text-ivory-500">{t("topEmpty")}</p>
      ) : (
        // Ranked bars, one hue: name, bar, figure per row (the figure is text, never the bar's color).
        <ol className="flex flex-col gap-3">
          {packs.map((p) => (
            <li key={p.slug} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/product/${p.slug}`} className="min-w-0 text-pretty text-ivory-100 hover:text-gold-300">
                  {p.title}
                </Link>
                <span className="shrink-0 text-xs text-ivory-300 tabular-nums">{t("topCount", { count: p.count })}</span>
              </div>
              <div aria-hidden="true" className="h-2 rounded-r-[4px] bg-gold-600" style={{ width: `${Math.max(2, (p.count / max) * 100)}%` }} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const STATUS_ORDER: OrderStatus[] = ["PAID", "PENDING", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"];

async function OrdersCard({ orders, locale }: { orders: AccountStats["orders"]; locale: Locale }) {
  const [t, tr, tc, format] = await Promise.all([getTranslations("stats"), getTranslations("checkout.result"), getTranslations("common"), getFormatter()]);
  const chips: ReactNode[] = STATUS_ORDER.filter((s) => orders.byStatus[s] > 0).map((s) => (
    <li key={s} className="flex items-center gap-1.5 rounded-full border border-bronze-700 px-2.5 py-0.5 text-xs">
      <span className="text-ivory-300">{tr(`status.${s}`)}</span>
      <span className="font-semibold text-ivory-100 tabular-nums">{orders.byStatus[s]}</span>
    </li>
  ));
  return (
    <section aria-labelledby="stats-orders" className={`flex flex-col gap-3 p-5 ${card}`} data-testid="orders-card">
      <h2 id="stats-orders" className="font-sans text-base font-semibold text-ivory-100">
        {t("ordersTitle")}
      </h2>
      {orders.total === 0 ? (
        <p className="text-sm text-ivory-500">{t("ordersEmpty")}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5" data-testid="order-status-counts">
            {chips}
          </ul>
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <h3 className="font-sans text-xs font-medium text-ivory-500">{t("recentTitle")}</h3>
            <Link href="/orders" className="text-xs font-medium text-gold-300 underline-offset-2 hover:underline">
              {t("allOrders")}
            </Link>
          </div>
          <ul className="-mx-2 flex flex-col">
            {orders.recent.map((o) => (
              <li key={o.code}>
                <Link
                  href={`/orders/${o.code}`}
                  aria-label={t("viewOrder", { code: o.code })}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ivory-100/5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium whitespace-nowrap text-ivory-100 tabular-nums">{o.code}</span>
                    <span className="text-xs text-ivory-500">
                      {format.dateTime(o.createdAt, { dateStyle: "medium" })} · {o.extraDownloads ? t("orderExtraDownloads", { count: o.extraDownloads }) : t("orderItems", { count: o.itemCount })}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {o.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                      <Badge variant={o.status === "PAID" ? "free" : "neutral"}>{tr(`status.${o.status}`)}</Badge>
                    </div>
                  </div>
                  <span className="shrink-0 self-start text-sm text-ivory-100 tabular-nums">{formatVnd(o.totalVnd, locale)}</span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ivory-500" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
