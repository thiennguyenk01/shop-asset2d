import { Download, Package, ReceiptText, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Badge } from "@/components/ui/badge";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { niceAxis, parseStatsRange, STATS_RANGES, type StatsRange } from "@backend/lib/admin/stats-rules";
import { cn } from "@/lib/cn";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getAdminOverview, getAdminStats } from "@backend/modules/stats/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: `${t("overview.title")} · ${t("title")}` };
}

const card = "rounded-2xl border border-bronze-700 bg-ink-900";
const listCard = `flex flex-col gap-3 p-5 ${card}`;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Admin overview (GĐ5.1) with the statistics merged in (GĐ5.7, DECISIONS #36; the user asked on 2026-11-19 for
 * one page instead of a separate "Statistics" page): store-wide numbers, revenue over time (real and Demo apart)
 * for 7 days / 30 days / 12 months (`?range=`), then one row of three cards: the latest orders, best sellers and
 * the most downloaded free packs. "Needs attention" is the bell in the Admin top bar (`admin-attention.tsx`).
 */
export default async function AdminOverviewPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const t = await getTranslations("admin.overview");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("title")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("intro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="flex flex-col gap-5" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-28 animate-pulse first:col-span-2 xl:first:col-span-1 ${card}`} />
              ))}
            </div>
            <div className={`h-96 animate-pulse ${card}`} />
          </div>
        }
      >
        <Dashboard params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const [{ locale: raw }, sp] = await Promise.all([params, searchParams]);
  const locale = raw as Locale;
  const range = parseStatsRange(one(sp.range));
  const [o, s, t, ts, tr, tc, format] = await Promise.all([
    getAdminOverview(),
    getAdminStats(range, locale),
    getTranslations("admin.overview"),
    getTranslations("adminStats"),
    getTranslations("checkout.result"),
    getTranslations("common"),
    getFormatter(),
  ]);
  const vnd = (n: number) => formatVnd(n, locale);
  const num = (n: number) => format.number(n);

  const tiles: { key: string; Icon: LucideIcon; label: string; value: string; note: string; extra?: string }[] = [
    {
      key: "revenue",
      Icon: Wallet,
      label: t("revenue"),
      value: vnd(o.revenue.totalVnd),
      note: t("revenueNote", { count: o.revenue.paidOrders, recent: vnd(o.revenue.recentVnd) }),
      extra:
        o.revenue.demoOrders > 0
          ? t("demoNote", { amount: vnd(o.revenue.demoVnd), count: o.revenue.demoOrders })
          : undefined,
    },
    {
      key: "orders",
      Icon: ReceiptText,
      label: t("orders"),
      value: num(o.orders.total),
      note: t("ordersNote", { pending: num(o.orders.pending), failed: num(o.orders.failedOrExpired) }),
    },
    {
      key: "packs",
      Icon: Package,
      label: t("packs"),
      value: num(o.packs.total),
      note: t("packsNote", {
        published: num(o.packs.published),
        hidden: num(o.packs.hidden),
        draft: num(o.packs.draft),
      }),
    },
    {
      key: "users",
      Icon: UsersRound,
      label: t("users"),
      value: num(o.users.total),
      note: t("usersNote", { recent: num(o.users.recent), admins: num(o.users.admins), locked: num(o.users.locked) }),
    },
    {
      key: "downloads",
      Icon: Download,
      label: t("downloads"),
      value: num(o.downloads.recent),
      note: t("downloadsNote", { total: num(o.downloads.total) }),
    },
  ];

  // Revenue over time for the chosen range.
  const daily = s.granularity === "day";
  // Short axis labels ("19/11", "11/26"): a month spelled out ("tháng 11, 26") made the 12 labels overlap.
  const periodLabel = (d: Date) =>
    daily
      ? format.dateTime(d, { day: "2-digit", month: "2-digit" })
      : format.dateTime(d, { month: "numeric", year: "2-digit" });
  const periodFull = (d: Date) =>
    daily ? format.dateTime(d, { dateStyle: "medium" }) : format.dateTime(d, { month: "long", year: "numeric" });
  const ticks = niceAxis(Math.max(0, ...s.series.map((p) => Math.max(p.realVnd, p.demoVnd)))).map((v) => ({
    value: v,
    label: format.number(v, { notation: "compact", maximumFractionDigits: 1 }),
  }));
  const empty = s.totals.realVnd === 0 && s.totals.demoVnd === 0;
  // The Demo sum is named "Demo revenue" (and the legend says it is not a real transaction): no extra badge, which
  // would wrap on a phone and push its number below the others.
  const sums: { key: string; label: string; value: string; note: string }[] = [
    {
      key: "real",
      label: ts("tiles.real"),
      value: vnd(s.totals.realVnd),
      note: ts("tiles.orders", { count: s.totals.realOrders }),
    },
    {
      key: "demo",
      label: ts("tiles.demo"),
      value: vnd(s.totals.demoVnd),
      note: ts("tiles.orders", { count: s.totals.demoOrders }),
    },
    {
      key: "paid",
      label: ts("tiles.paid"),
      value: num(s.totals.realOrders + s.totals.demoOrders),
      note: ts("tiles.paidNote", { real: num(s.totals.realOrders), demo: num(s.totals.demoOrders) }),
    },
    { key: "users", label: ts("tiles.users"), value: num(s.totals.newUsers), note: ts("tiles.usersNote") },
  ];

  return (
    <>
      {/* Two tiles per row up to wide screens (user request 2026-11-21); revenue, whose amount can be long, takes a
          whole row there, so the other four make a 2 × 2 block. */}
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3" data-testid="admin-tiles">
        {tiles.map(({ key, Icon, label, value, note, extra }) => (
          <li
            key={key}
            className={`flex min-w-0 flex-col gap-1.5 p-3 first:col-span-2 sm:p-4 xl:first:col-span-1 ${card}`}
            data-testid={`admin-tile-${key}`}
          >
            <span className="flex items-center gap-2 text-sm text-ivory-300">
              <Icon aria-hidden="true" className="size-4 text-gold-400" />
              {label}
            </span>
            <span
              className="text-xl font-semibold break-words text-ivory-100 tabular-nums sm:text-2xl"
              data-testid={`admin-tile-${key}-value`}
            >
              {value}
            </span>
            <span className="text-xs text-pretty text-ivory-500">{note}</span>
            {extra && <span className="text-xs text-pretty text-ivory-500">{extra}</span>}
          </li>
        ))}
      </ul>

      <section
        id="revenue"
        aria-labelledby="revenue-title"
        className={`flex scroll-mt-20 flex-col gap-4 p-5 ${card}`}
        data-testid="stats-revenue"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id="revenue-title" className="font-sans text-base font-semibold text-ivory-100">
              {ts("revenueTitle")}
            </h2>
            <p className="text-xs text-pretty text-ivory-500">
              {ts("revenueIntro")} {ts("since", { date: format.dateTime(s.since, { dateStyle: "medium" }) })}
            </p>
          </div>
          <nav className="flex shrink-0 gap-1" aria-label={ts("rangeLabel")} data-testid="stats-ranges">
            {STATS_RANGES.map((r: StatsRange) => (
              <Link
                key={r}
                href={{ pathname: "/admin", query: { range: r } }}
                scroll={false}
                aria-current={r === range ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-xl border px-3 text-sm whitespace-nowrap",
                  r === range
                    ? "border-gold-500 bg-gold-500/10 font-medium text-ivory-100"
                    : "border-bronze-700 text-ivory-300 hover:bg-ivory-100/5 hover:text-ivory-100",
                )}
                data-testid={`stats-range-${r}`}
              >
                {ts(`range.${r}`)}
              </Link>
            ))}
          </nav>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" data-testid="stats-sums">
          {sums.map(({ key, label, value, note }) => (
            <div key={key} className="flex flex-col gap-0.5" data-testid={`stats-sum-${key}`}>
              <dt className="flex items-center gap-1.5 text-xs text-ivory-300">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 shrink-0 rounded-sm",
                    key === "real" ? "bg-chart-real" : key === "demo" ? "bg-chart-demo" : "hidden",
                  )}
                />
                {label}
              </dt>
              <dd className="text-lg font-semibold text-ivory-100 tabular-nums" data-testid={`stats-value-${key}`}>
                {value}
              </dd>
              <dd className="text-xs text-pretty text-ivory-500">{note}</dd>
            </div>
          ))}
        </dl>

        {empty && (
          <p className="text-sm text-ivory-500" data-testid="stats-empty">
            {ts("revenueEmpty")}
          </p>
        )}
        <RevenueChart
          ariaLabel={ts("chartAria", { real: vnd(s.totals.realVnd), demo: vnd(s.totals.demoVnd) })}
          legend={{ real: ts("legendReal"), demo: ts("legendDemo") }}
          labels={{
            pick: ts("pick", { unit: s.granularity }),
            close: ts("pickClose"),
            real: ts("tiles.real"),
            demo: ts("tiles.demo"),
          }}
          ticks={ticks}
          points={s.series.map((p) => ({
            key: p.key,
            label: periodLabel(p.start),
            period: periodFull(p.start),
            aria: ts("tooltip", { period: periodFull(p.start), real: vnd(p.realVnd), demo: vnd(p.demoVnd) }),
            real: p.realVnd,
            demo: p.demoVnd,
            realText: vnd(p.realVnd),
            demoText: vnd(p.demoVnd),
            realOrdersText: ts("tiles.orders", { count: p.realOrders }),
            demoOrdersText: ts("tiles.orders", { count: p.demoOrders }),
          }))}
        />
      </section>

      {/* Recent orders, best sellers, most downloaded free packs: one row of three equal cards (user request). */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="admin-lists">
        <section aria-labelledby="recent-title" className={listCard} data-testid="admin-recent-orders">
          <header className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="recent-title" className="font-sans text-base font-semibold text-ivory-100">
                {t("recentTitle")}
              </h2>
              <p className="text-xs text-pretty text-ivory-500">{t("recentIntro")}</p>
            </div>
            <Link
              href="/admin/orders"
              className="shrink-0 text-xs text-gold-400 hover:underline"
              data-testid="admin-recent-all"
            >
              {t("viewAllOrders")}
            </Link>
          </header>
          {o.recent.length === 0 ? (
            <p className="text-sm text-ivory-500">{t("recentEmpty")}</p>
          ) : (
            <ul className="-mx-2 flex flex-col divide-y divide-bronze-700">
              {o.recent.map((r) => (
                <li key={r.code}>
                  <Link
                    href={`/admin/orders/${r.code}`}
                    className="flex flex-col gap-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-ivory-100/5"
                    data-testid="admin-recent-order"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ivory-100 tabular-nums">{r.code}</span>
                      <span className="shrink-0 text-sm font-medium text-ivory-100 tabular-nums">
                        {vnd(r.totalVnd)}
                      </span>
                    </span>
                    <span className="text-xs break-all text-ivory-500">
                      <span className="sr-only">{t("buyer")}: </span>
                      {r.buyerEmail} · {format.dateTime(r.createdAt, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {r.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                      <Badge variant={r.status === "PAID" ? "free" : "neutral"}>{tr(`status.${r.status}`)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="top-sellers-title" className={listCard} data-testid="stats-top-sellers">
          <header className="flex flex-col gap-0.5">
            <h2 id="top-sellers-title" className="font-sans text-base font-semibold text-ivory-100">
              {ts("topSellers")}
            </h2>
            <p className="text-xs text-pretty text-ivory-500">{ts("topSellersIntro")}</p>
          </header>
          {s.topSellers.length === 0 ? (
            <p className="text-sm text-ivory-500">{ts("topEmpty")}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-bronze-700">
              {s.topSellers.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 py-2"
                  data-testid="stats-top-seller"
                  data-slug={p.slug}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-ivory-500 tabular-nums">{i + 1}</span>
                  {/* The counts sit under the title so a long title keeps one line in a narrow card. */}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-sm text-pretty text-ivory-100 hover:underline"
                    >
                      {p.title}
                    </Link>
                    <span className="text-xs text-ivory-500 tabular-nums">
                      {ts("sold", { real: num(p.real), demo: num(p.demo) })}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="top-free-title" className={listCard} data-testid="stats-top-free">
          <header className="flex flex-col gap-0.5">
            <h2 id="top-free-title" className="font-sans text-base font-semibold text-ivory-100">
              {ts("topFree")}
            </h2>
            <p className="text-xs text-pretty text-ivory-500">{ts("topFreeIntro")}</p>
          </header>
          {s.topFree.length === 0 ? (
            <p className="text-sm text-ivory-500">{ts("topEmpty")}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-bronze-700">
              {s.topFree.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 py-2"
                  data-testid="stats-top-free-item"
                  data-slug={p.slug}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-ivory-500 tabular-nums">{i + 1}</span>
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="min-w-0 flex-1 text-sm text-pretty text-ivory-100 hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ivory-300 tabular-nums">
                    <Download aria-hidden="true" className="size-3.5" />
                    {num(p.downloads)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
