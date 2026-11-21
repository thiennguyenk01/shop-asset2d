import { Check, Info, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { BenefitList } from "@/components/product/benefit-list";
import { CategoryIcon } from "@/components/product/category-icon";
import { ProductGallery } from "@/components/product/product-gallery";
import { SectionMedia } from "@/components/product/section-media";
import { TYPE_BADGE } from "@/components/product/product-card";
import { ProductGrid } from "@/components/product/product-grid";
import { FreeDownloadSkeleton } from "@/components/product/free-download";
import { FreeDownloadServer } from "@/components/product/free-download-server";
import { PremiumActionsServer } from "@/components/product/premium-actions-server";
import { SectionNav, type SectionNavItem } from "@/components/product/section-nav";
import { BackToShopButton } from "@/components/shop/back-to-shop";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { routing, type Locale } from "@backend/i18n/routing";
import { formatVnd, savingPercent } from "@backend/lib/format";
import { packBenefits } from "@backend/lib/catalog/benefits";
import { isShareableImage, pageAlternates, shareMetadata } from "@backend/lib/seo/seo";
import {
  getProductDetail,
  getRelatedProducts,
  listPublishedSlugs,
  type MediaData,
} from "@backend/modules/product/queries";
import { mediaUrl } from "@backend/storage/media-url";
import { Suspense } from "react";

/**
 * Blocking on purpose: every published pack is prerendered (generateStaticParams), so navigation
 * stays fast, and awaiting params outside <Suspense> lets an unknown slug answer a real HTTP 404
 * instead of a streamed 200. See CLAUDE.md §1 (instant).
 */
export const instant = false;

/**
 * Prerender every pack visible in this language; packs published later render on first request. A pack not
 * written in this language is not listed and its page is the localized 404 (DECISIONS #39).
 */
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const slugs = await listPublishedSlugs(params.locale as Locale);
  // Cache Components needs at least one param to validate the route at build time.
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/product/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProductDetail(locale as Locale, slug);
  if (!product) return {};
  // GĐ7.3: the other languages this pack is written in (DECISIONS #39), and its first picture a link preview
  // can show (the SVG demo pictures cannot: then the site icon).
  const [tm, ...lists] = await Promise.all([getTranslations("metadata"), ...routing.locales.map((l) => listPublishedSlugs(l))]);
  const available = routing.locales.filter((_, i) => lists[i].includes(slug));
  const picture = product.gallery.find((m) => !m.video && isShareableImage(m.mimeType));
  const path = `/product/${slug}`;
  return {
    title: product.title,
    description: product.shortDescription,
    alternates: pageAlternates(locale as Locale, path, available),
    ...shareMetadata({
      locale: locale as Locale,
      siteName: tm("siteName"),
      title: product.title,
      description: product.shortDescription,
      path,
      image: picture ? mediaUrl(picture.key) : null,
    }),
  };
}

const image = (m: MediaData) => ({
  src: mediaUrl(m.key),
  width: m.width ?? 800,
  height: m.height ?? 600,
  isPlaceholder: m.isPlaceholder,
  video: m.video,
  mimeType: m.mimeType,
});

export default async function ProductPage({ params }: PageProps<"/[locale]/product/[slug]">) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  const product = await getProductDetail(locale, slug);
  if (!product) notFound();

  const [t, tp, tc, format, related] = await Promise.all([
    getTranslations("productPage"),
    getTranslations("product"),
    getTranslations("common"),
    getFormatter(),
    getRelatedProducts(
      locale,
      product.id,
      product.genres.map((g) => g.slug),
    ),
  ]);

  const badge = TYPE_BADGE[product.type];
  const saving = savingPercent(product.priceVnd, product.compareAtPriceVnd);
  const gallery = product.gallery.map(image);
  const navItems: SectionNavItem[] = [
    { id: "overview", label: t("overview"), icon: "overview" },
    ...product.sections.map((s) => ({ id: `sec-${s.slug}`, label: s.name, icon: s.icon ?? "" })),
    { id: "benefits", label: t("benefitsTitle"), icon: "benefits" },
    { id: "reviews", label: t("reviewsTitle"), icon: "reviews" },
  ];

  // Buy column (user request 2026-11-15: everything visible without scrolling to the end of the page):
  // the numbers as a 2×2 grid right under the buy button, the rest as one-line rows.
  const keyFacts: { label: string; value: string; testId: string }[] = [
    { label: t("totalAssets"), value: format.number(product.assetCount), testId: "fact-total-assets" },
    { label: t("sectionCount"), value: format.number(product.sections.length), testId: "fact-sections" },
    ...(product.version
      ? [
          { label: t("version"), value: product.version.version, testId: "fact-version" },
          // A pack on sale always has a released version; the date is skipped rather than invented otherwise.
          ...(product.version.releasedAt
            ? [
                {
                  label: t("updated"),
                  value: format.dateTime(product.version.releasedAt, { dateStyle: "medium" }),
                  testId: "fact-updated",
                },
              ]
            : []),
        ]
      : []),
  ];
  const specs: { label: string; value: string }[] = [
    { label: t("formats"), value: product.fileFormats.join(", ") },
    { label: t("software"), value: product.compatibleSoftware.join(", ") },
    { label: t("genres"), value: product.genres.map((g) => g.name).join(", ") },
    { label: t("style"), value: product.styles.map((s) => s.name).join(", ") },
  ].filter((s) => s.value.length > 0);

  // "Benefits" of this pack's type only (Free or Premium); shown in the buy panel and in its own block.
  const isFree = product.type === "FREE";
  const benefitsHeading = isFree ? t("benefitsFree") : t("benefitsPremium");
  const benefitRows = product.license
    ? packBenefits(product.license.flags).map(({ key, included }) => ({ key, included, label: t(`benefits.${key}`) }))
    : [];
  const noResale = product.license ? !product.license.flags.redistribution && !product.license.flags.resale : false;

  return (
    <>
      {/* @container: the buy column opens from a 70rem content box, not a viewport breakpoint (record-detail.md). */}
      <div className="@container w-full max-w-[1600px] p-4 pb-36 sm:p-6 sm:pb-36">
        <header className="flex flex-col gap-2 pb-6">
          <BackToShopButton label={t("backToShop")} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={badge.variant}>{tc(badge.key)}</Badge>
            {saving !== null && <Badge variant="neutral">{tp("saving", { percent: saving })}</Badge>}
          </div>
          <h1 className="text-xl font-semibold text-balance text-ivory-100">{product.title}</h1>
          <p className="max-w-[55ch] text-sm text-pretty text-ivory-300">{product.shortDescription}</p>
        </header>

        <div className="grid items-start gap-6 @[70rem]:grid-cols-[minmax(0,1fr)_22rem]">
          {/* 1 — Overview gallery */}
          <section id="overview" aria-label={t("galleryLabel")} className="min-w-0 scroll-mt-20">
            <ProductGallery
              images={gallery}
              alt={product.title}
              labels={{
                gallery: t("galleryLabel"),
                showImage: gallery.map((_, i) => t("showImage", { index: i + 1 })),
                demoImage: tp("demoImage"),
                noImage: tp("noImage"),
              }}
            />
          </section>

          {/* 2 — Buy panel: right column (sticky) on wide boxes, right under the gallery otherwise. Kept short so the
               whole panel fits on screen while it sticks; on a very short window it scrolls inside instead of being cut. */}
          <aside
            aria-label={t("specsTitle")}
            className="flex flex-col rounded-2xl border border-bronze-700 bg-ink-900 @[70rem]:sticky @[70rem]:top-20 @[70rem]:row-span-2 @[70rem]:max-h-[calc(100dvh-6rem-var(--bottom-bar-height,0px))] @[70rem]:overflow-y-auto @[70rem]:overscroll-contain"
            data-testid="buy-panel"
          >
            <div className="flex flex-col gap-4 p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-gold-300 tabular-nums" data-testid="product-price">
                  {/* A free pack shows "FREE", not "0 ₫" (user request 2026-11-20). */}
                  {isFree ? tc("freePrice") : formatVnd(product.priceVnd, locale)}
                </span>
                {product.compareAtPriceVnd !== null && (
                  <span className="text-sm text-ivory-500 tabular-nums line-through">
                    <span className="sr-only">{tp("compareAt", { price: "" })}</span>
                    {formatVnd(product.compareAtPriceVnd, locale)}
                  </span>
                )}
              </div>
              {isFree ? (
                <Suspense fallback={<FreeDownloadSkeleton label={t("downloadFree")} />}>
                  <FreeDownloadServer productId={product.id} slug={product.slug} title={product.title} />
                </Suspense>
              ) : (
                // Neutral placeholder while the session is read, so owners never see a flash of "Buy now".
                <Suspense
                  fallback={
                    <div aria-hidden="true" className="flex flex-col gap-2">
                      <div className="h-11 animate-pulse rounded-xl bg-ink-800" />
                      <div className="h-11 animate-pulse rounded-xl bg-ink-800" />
                    </div>
                  }
                >
                  <PremiumActionsServer productId={product.id} />
                </Suspense>
              )}
            </div>

            <div className="flex flex-col gap-4 border-t border-bronze-700 p-5">
              {/* Key numbers first: one glance, no scrolling. */}
              <dl
                className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-bronze-700 bg-bronze-700"
                data-testid="key-facts"
              >
                {keyFacts.map((f, i) => (
                  <div
                    key={f.label}
                    className="flex min-w-0 flex-col gap-0.5 bg-ink-900 px-3 py-2.5"
                    data-testid={f.testId}
                  >
                    <dt className="text-xs text-ivory-500">{f.label}</dt>
                    <dd
                      className={`font-semibold wrap-anywhere tabular-nums ${i === 0 ? "text-lg text-gold-300" : "text-sm leading-7 text-ivory-100"}`}
                    >
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                {specs.map((s) => (
                  <div key={s.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
                    <dt className="text-ivory-500">{s.label}</dt>
                    <dd className="min-w-0 font-medium text-pretty wrap-anywhere text-ivory-100">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {product.license && (
              // Short summary; the full list is the "Benefits" block of the page (also shown in cart and checkout).
              <div
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-bronze-700 px-5 py-3.5 text-sm"
                data-testid="benefits-summary"
              >
                <span className="flex items-center gap-2 text-ivory-100">
                  <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-jade-400" />
                  {t("benefitsSummary", {
                    heading: benefitsHeading,
                    included: benefitRows.filter((r) => r.included).length,
                    total: benefitRows.length,
                  })}
                </span>
                <a href="#benefits" className="font-medium text-gold-300 underline-offset-2 hover:underline">
                  {t("benefitsSee")}
                </a>
              </div>
            )}
          </aside>

          {/* 3 — Everything else, main column */}
          <div className="flex min-w-0 flex-col gap-6">
            {product.isDemoData && (
              <div role="status" className="flex gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-4">
                <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ivory-500" />
                <p className="text-sm text-pretty text-ivory-100/80">{t("demoNotice")}</p>
              </div>
            )}

            {/* Sections of the pack = the 21 categories, in ONE frame (card.md "Nhiều mục cùng loại thì MỘT khung"). */}
            <section aria-labelledby="sections-title" className="rounded-2xl border border-bronze-700 bg-ink-900">
              <header className="flex flex-col gap-1 px-5 py-4">
                <h2 id="sections-title" className="text-lg font-semibold text-ivory-100">
                  {t("sectionsTitle")}
                </h2>
                <p className="max-w-[60ch] text-sm text-pretty text-ivory-500">
                  {t("sectionsIntro", { count: product.sections.length })}
                </p>
              </header>
              <ol className="divide-y divide-bronze-700 border-t border-bronze-700">
                {product.sections.map((s, i) => (
                  <li key={s.id}>
                    <article
                      id={`sec-${s.slug}`}
                      aria-labelledby={`sec-${s.slug}-title`}
                      className="@container grid scroll-mt-20 gap-4 p-5 @[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
                    >
                      <div className="flex min-w-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-500/10 text-gold-300">
                            <CategoryIcon name={s.icon} className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <h3 id={`sec-${s.slug}-title`} className="text-base font-semibold text-ivory-100">
                              {s.name}
                            </h3>
                            <p className="text-xs text-ivory-500 tabular-nums">
                              {String(i + 1).padStart(2, "0")} · {tp("assets", { count: s.assetCount })}
                            </p>
                          </div>
                        </div>
                        {s.summary && <p className="text-sm text-pretty text-ivory-300">{s.summary}</p>}
                        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                          {s.resolution && (
                            <div className="flex gap-1.5">
                              <dt className="text-ivory-500">{t("resolution")}:</dt>
                              <dd className="text-ivory-100">{s.resolution}</dd>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <dt className="text-ivory-500">{t("formats")}:</dt>
                            <dd className="text-ivory-100">{s.fileFormats.join(", ")}</dd>
                          </div>
                        </dl>
                        {s.contentsList.length > 0 && (
                          <ul aria-label={t("includes")} className="flex flex-col gap-1 text-sm text-ivory-300">
                            {s.contentsList.map((c) => (
                              <li key={c} className="flex gap-2">
                                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-jade-400" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {s.media.length > 0 && <SectionMedia items={s.media.map(image)} name={s.name} />}
                    </article>
                  </li>
                ))}
              </ol>
            </section>

            <section
              aria-labelledby="description-title"
              className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5"
            >
              <h2 id="description-title" className="text-lg font-semibold text-ivory-100">
                {t("descriptionTitle")}
              </h2>
              {product.description.split(/\n{2,}/).map((para) => (
                <p key={para} className="max-w-[75ch] text-sm leading-relaxed text-pretty text-ivory-300">
                  {para}
                </p>
              ))}
            </section>

            {product.license && (
              <section
                id="benefits"
                aria-labelledby="benefits-title"
                className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-5"
              >
                <h2 id="benefits-title" className="text-lg font-semibold text-ivory-100">
                  {benefitsHeading}
                </h2>
                <BenefitList
                  rows={benefitRows}
                  included={t("included")}
                  notIncluded={t("notIncluded")}
                  testId="pack-benefits"
                  twoColumns
                />
                {isFree && <p className="text-sm text-pretty text-ivory-300">{t("benefitsUpsell")}</p>}
                {noResale && <p className="text-xs text-ivory-500">{t("benefitsNote")}</p>}
              </section>
            )}

            {/* Only verified owners can review — nothing is faked. */}
            <section
              id="reviews"
              aria-labelledby="reviews-title"
              className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-5"
            >
              <h2 id="reviews-title" className="text-lg font-semibold text-ivory-100">
                {t("reviewsTitle")}
              </h2>
              <EmptyState title={t("reviewsEmptyTitle")} description={t("reviewsEmptyText")} />
            </section>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-10 flex flex-col gap-4">
            <h2 id="related-title" className="text-lg font-semibold text-ivory-100">
              {t("relatedTitle")}
            </h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>

      <SectionNav
        items={navItems}
        label={t("sectionNavLabel")}
        scrollLabels={{ previous: t("navPrevious"), next: t("navNext") }}
      />
    </>
  );
}
