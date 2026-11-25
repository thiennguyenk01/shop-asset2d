import { ChevronDown, Gift, History, Info, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BuyDownloadsButton, type ExtraDownloadsOffer } from "@/components/download/buy-downloads-button";
import { LibraryDownloadButton } from "@/components/download/library-download-button";
import { BenefitList } from "@/components/product/benefit-list";
import { TYPE_BADGE } from "@/components/product/product-card";
import { ProductThumb } from "@/components/product/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Seal } from "@/components/ui/seal";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { packBenefits } from "@backend/lib/catalog/benefits";
import { cn } from "@/lib/cn";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { getLibrary, type DownloadHistoryEntry, type LibraryItem } from "@backend/modules/library/service";
import { isDemoMode } from "@backend/modules/payment/providers";
import { getExtraDownloadsOffer } from "@backend/modules/settings/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("library"), robots: { index: false } };
}

/** Page frame: name in the top bar (<h1>); packs on the left, guide + history on the right from a 56rem box. */
const frame = "@container flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6";
const card = "rounded-2xl border border-bronze-700 bg-ink-900";

export default async function LibraryPage({ params }: PageProps<"/[locale]/library">) {
  const { locale } = await params;
  const tc = await getTranslations("common");
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{tc("loading")}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-28 animate-pulse ${card}`} />
            ))}
          </div>
        }
      >
        <LibraryContent locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function LibraryContent({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  const t = await getTranslations("library");

  // Guests are invited, not bounced: the tab is in the main navigation and a free pack never needs an account.
  if (!user) {
    return (
      <section
        aria-labelledby="library-guest"
        className={`flex flex-col items-center gap-4 px-5 py-10 text-center ${card}`}
        data-testid="library-guest"
      >
        <Seal glyphs="宝阁" size="lg" />
        <h2 id="library-guest" className="font-sans text-lg font-semibold text-ivory-100">
          {t("guestTitle")}
        </h2>
        <p className="max-w-[48ch] text-sm text-pretty text-ivory-300">{t("guestText")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={{ pathname: "/login", query: { callbackUrl: "/library" } }}>{t("signIn")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={{ pathname: "/register", query: { callbackUrl: "/library" } }}>{t("register")}</Link>
          </Button>
        </div>
      </section>
    );
  }

  const [{ items, history }, extra] = await Promise.all([getLibrary(user.id, locale), getExtraDownloadsOffer()]);
  const format = await getFormatter();
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  // "Buy more downloads" for free packs with none left (step 4.6): count and price are the server's.
  const offer: ExtraDownloadsOffer = {
    count: extra.count,
    price: formatVnd(extra.priceVnd, locale),
    isDemo: isDemoMode(),
  };

  return (
    <div className="grid items-start gap-4 @[56rem]:grid-cols-[minmax(0,1fr)_20rem] @[56rem]:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyText")}
            action={
              <Button asChild variant="jade">
                <Link href="/shop?type=free">
                  <Gift aria-hidden="true" className="size-4" />
                  {t("browseFree")}
                </Link>
              </Button>
            }
          />
        ) : (
          <section aria-label={t("itemsLabel", { count: items.length })} className={card}>
            <ul className="divide-y divide-bronze-700" data-testid="library-items">
              {items.map((item) => (
                <LibraryRow key={item.productId} item={item} date={date} offer={offer} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4 @[56rem]:sticky @[56rem]:top-20">
        <section aria-labelledby="library-guide" className={`flex flex-col gap-3 p-5 ${card}`}>
          <h2 id="library-guide" className="flex items-center gap-2 font-sans text-sm font-semibold text-ivory-100">
            <Info aria-hidden="true" className="size-4 text-gold-400" />
            {t("guideTitle")}
          </h2>
          <ol className="flex flex-col gap-2 text-sm text-ivory-300">
            {(["step1", "step2", "step3", "step4"] as const).map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold-500/10 text-xs font-semibold text-gold-300 tabular-nums">
                  {i + 1}
                </span>
                <span className="text-pretty">{t(`guide.${step}`)}</span>
              </li>
            ))}
          </ol>
        </section>
        <HistoryCard history={history} date={(d) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" })} />
      </aside>
    </div>
  );
}

async function LibraryRow({
  item,
  date,
  offer,
}: {
  item: LibraryItem;
  date: (d: Date) => string;
  offer: ExtraDownloadsOffer;
}) {
  const [t, tp, tpp, tc, td] = await Promise.all([
    getTranslations("library"),
    getTranslations("product"),
    getTranslations("productPage"),
    getTranslations("common"),
    getTranslations("download"),
  ]);
  const te = await getTranslations("extraDownloads");
  // A free pack with no downloads left: the row offers more downloads where the download button was.
  const exhausted = item.downloadable && item.freeDownloads?.left === 0;
  const action = exhausted ? (
    <BuyDownloadsButton productId={item.productId} title={item.title} offer={offer} />
  ) : (
    <LibraryDownloadButton productId={item.productId} title={item.title} />
  );
  const badge = TYPE_BADGE[item.type];
  const benefitRows = packBenefits(item.benefits).map(({ key, included }) => ({
    key,
    included,
    label: tpp(`benefits.${key}`),
  }));
  const meta = [
    t("acquired", { source: item.source, date: date(item.acquiredAt) }),
    item.version ? t("version", { version: item.version.version }) : null,
    item.lastDownloadedAt ? t("lastDownloaded", { date: date(item.lastDownloadedAt) }) : t("notDownloaded"),
  ].filter(Boolean);

  return (
    <li
      className={cn("flex flex-col gap-3 p-4", exhausted && "bg-gold-500/5")}
      data-testid="library-item"
      data-slug={item.slug}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <Link
          href={`/product/${item.slug}`}
          className="w-24 shrink-0 overflow-hidden rounded-xl sm:w-32"
          tabIndex={-1}
          aria-hidden="true"
        >
          <ProductThumb thumbnail={item.thumbnail} alt="" demoLabel={tc("demo")} noImageLabel={tp("noImage")} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={badge.variant}>{tc(badge.key)}</Badge>
            {/* "Free" already says how a free pack got here; bought / gifted packs say so. */}
            {item.source !== "FREE_CLAIM" && <Badge variant="neutral">{t(`source.${item.source}`)}</Badge>}
            {item.isDemoData && <Badge variant="demo">{tp("demoData")}</Badge>}
            {/* A version released after this owner's last download (user choice 2026-11-26). */}
            {item.newVersion && (
              <Badge
                variant="neutral"
                className="inline-flex items-center gap-1 text-gold-300"
                data-testid="library-new-version"
              >
                <Sparkles aria-hidden="true" className="size-3" />
                {t("newVersion", { version: item.newVersion.version })}
              </Badge>
            )}
          </div>
          <Link href={`/product/${item.slug}`} className="font-medium text-pretty text-ivory-100 hover:text-gold-300">
            {item.title}
          </Link>
          <p className="text-xs text-ivory-500">
            {meta.join(" · ")}
            {item.orderCode && (
              <>
                {" · "}
                <Link
                  href={`/orders/${item.orderCode}`}
                  className="font-medium text-gold-300 underline-offset-2 hover:underline"
                  data-testid="library-order-link"
                >
                  {t("orderLink", { code: item.orderCode })}
                </Link>
              </>
            )}
          </p>
          {item.freeDownloads && item.downloadable && (
            <p
              className={`text-xs font-medium tabular-nums ${exhausted ? "text-ivory-500" : "text-ivory-300"}`}
              data-testid="library-downloads-left"
            >
              {td("quota", { left: item.freeDownloads.left, total: item.freeDownloads.total })}
            </p>
          )}
          {exhausted && (
            <p className="text-xs font-medium text-pretty text-gold-300" data-testid="library-buy-nudge">
              {te("nudge", { count: offer.count, price: offer.price })}
            </p>
          )}
          {!item.downloadable && (
            <p className="text-xs font-medium text-cinnabar-500 light:text-cinnabar-600">{t("unavailable")}</p>
          )}
        </div>
        {item.downloadable && <div className="hidden shrink-0 sm:block">{action}</div>}
      </div>
      {item.newVersion && (
        <details
          className="group rounded-xl border border-gold-500/30 bg-gold-500/5 px-3 py-2 sm:ml-36"
          data-testid="library-whats-new"
        >
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-gold-300 [&::-webkit-details-marker]:hidden">
            {t("whatsNew", { version: item.newVersion.version })}
            <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-sm whitespace-pre-line text-pretty text-ivory-300">
              {item.newVersion.note ?? <span className="text-ivory-500">{tpp("changesNoNote")}</span>}
            </p>
            <Link
              href={`/product/${item.slug}#changes`}
              className="self-start text-xs font-medium text-gold-300 underline-offset-2 hover:underline"
            >
              {t("allVersions")}
            </Link>
          </div>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:pl-36">
        <details className="group min-w-0 flex-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg py-1 text-xs font-medium text-ivory-300 hover:text-ivory-100 [&::-webkit-details-marker]:hidden">
            {t("benefits")}
            <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-2">
            <BenefitList rows={benefitRows} included={tpp("included")} notIncluded={tpp("notIncluded")} twoColumns />
          </div>
        </details>
        {item.downloadable && <div className="sm:hidden">{action}</div>}
      </div>
    </li>
  );
}

async function HistoryCard({ history, date }: { history: DownloadHistoryEntry[]; date: (d: Date) => string }) {
  const t = await getTranslations("library");
  return (
    <section
      aria-labelledby="library-history"
      className={`flex flex-col gap-3 p-5 ${card}`}
      data-testid="download-history"
    >
      <header className="flex flex-col gap-0.5">
        <h2 id="library-history" className="flex items-center gap-2 font-sans text-sm font-semibold text-ivory-100">
          <History aria-hidden="true" className="size-4 text-gold-400" />
          {t("historyTitle")}
        </h2>
        {history.length > 0 && <p className="text-xs text-ivory-500">{t("historyIntro", { count: history.length })}</p>}
      </header>
      {history.length === 0 ? (
        <p className="text-sm text-ivory-500">{t("historyEmpty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-bronze-700">
          {history.map((h) => (
            <li key={h.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <Link href={`/product/${h.slug}`} className="text-sm text-pretty text-ivory-100 hover:text-gold-300">
                {h.title}
              </Link>
              <p className="text-xs text-ivory-500 tabular-nums">
                {date(h.at)}
                {h.version && ` · ${t("version", { version: h.version })}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
