import { ArrowLeft, ChevronRight, ImagePlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MediaManager } from "@/components/admin/media-manager";
import { PackCard, PackChecklist, PackEditor, PackPanel } from "@/components/admin/pack-editor";
import { packTabFrom, type CheckItem, type PackTab } from "@/components/admin/pack-tabs";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { PackDeleteButton, PackStatusActions } from "@/components/admin/product-status-panel";
import { AddSectionTile } from "@/components/admin/section-forms";
import { VersionPanel } from "@/components/admin/version-panel";
import { CategoryIcon } from "@/components/product/category-icon";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { ADMIN_LOCALES, packTextLocales, writtenLocales } from "@backend/lib/admin/product-rules";
import { requireAdminPage } from "@backend/auth/admin-page";
import { addSectionAction, updateProductAction } from "@backend/modules/product/admin-actions";
import { getAdminGallery, getAdminVersions } from "@backend/modules/product/admin-media-service";
import { getAdminProduct, getAdminTaxonomy } from "@backend/modules/product/admin-service";
import { mediaUrl } from "@backend/storage/media-url";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

/** Pack ids are not known at build time: a placeholder param keeps the route buildable (CLAUDE.md §1). */
export function generateStaticParams() {
  return [{ id: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminProducts");
  return { title: t("listTitle") };
}

/**
 * Edit one asset pack (GĐ5.2–5.3; layout since 2026-11-21, wireframe A): the pack header (cover, name, status,
 * status moves), then five tabs — Info · Content · Pictures · Sections · Files — and the "ready to sell" panel.
 */
export default async function AdminProductPage({ params, searchParams }: PageProps<"/[locale]/admin/products/[id]">) {
  const t = await getTranslations("adminProducts");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/admin/products"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
        data-testid="admin-product-back"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <Editor params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Editor({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const [{ locale: raw, id }, search] = await Promise.all([params, searchParams]);
  const locale = raw as Locale;
  const [p, taxonomy, t, tm, gallery, versions] = await Promise.all([
    getAdminProduct(id, locale),
    getAdminTaxonomy(locale),
    getTranslations("adminProducts"),
    getTranslations("adminMedia"),
    getAdminGallery(id, null),
    getAdminVersions(id),
  ]);
  if (!p || !versions) redirect({ href: "/admin/products", locale });
  const product = p!;

  const tr = (l: string) => product.translations.find((x) => x.locale === l);
  const initial: ProductFormValues = {
    slug: product.slug,
    type: product.type,
    priceVnd: product.priceVnd,
    compareAtPriceVnd: product.compareAtPriceVnd,
    isFeatured: product.isFeatured,
    resolution: product.resolution ?? "",
    compatibleSoftware: product.compatibleSoftware,
    genreIds: product.genres.map((g) => g.genreId),
    artStyleIds: product.artStyles.map((s) => s.artStyleId),
    translations: Object.fromEntries(
      ADMIN_LOCALES.map((l) => [
        l,
        {
          title: tr(l)?.title ?? "",
          shortDescription: tr(l)?.shortDescription ?? "",
          description: tr(l)?.description ?? "",
          contentsList: tr(l)?.contentsList ?? [],
        },
      ]),
    ) as ProductFormValues["translations"],
  };
  const title = tr(locale)?.title || tr("vi")?.title || "";
  const category = (cid: string) => taxonomy.categories.find((c) => c.id === cid);
  const remaining = taxonomy.categories.filter((c) => !product.sections.some((s) => s.categoryId === c.id));
  const cover = gallery.find((m) => m.kind === "THUMBNAIL");
  const version = product.currentVersion;

  // "Ready to sell": one line per thing a pack needs, from the same rules as the publish blockers.
  const blocked = (key: string) => product.blockers.some((b) => b.key === key);
  const textLocales = packTextLocales(product.translations);
  const sectionRows = product.sections.map((s) => ({ name: category(s.categoryId)?.name ?? "", translations: s.translations }));
  const written = writtenLocales({ translations: product.translations, sections: sectionRows });
  const localeNames = (ls: readonly string[]) => ls.map((l) => t(`locales.${l}` as "locales.vi")).join(", ");
  const summaryMissing = sectionRows.filter((s) => textLocales.some((l) => !s.translations.find((x) => x.locale === l)?.summary.trim()));
  const missingIn = textLocales.filter((l) => summaryMissing.some((s) => !s.translations.find((x) => x.locale === l)?.summary.trim()));
  const checks: CheckItem[] = [
    textLocales.length > 0
      ? { key: "content", tab: "content", state: "ok", text: t("check.contentOk", { locales: localeNames(textLocales) }) }
      : { key: "content", tab: "content", state: "miss", text: t("check.contentMiss") },
    blocked("noCover")
      ? { key: "cover", tab: "media", state: "miss", text: t("check.coverMiss") }
      : { key: "cover", tab: "media", state: "ok", text: t("check.coverOk") },
    product.sections.length === 0
      ? { key: "sections", tab: "sections", state: "miss", text: t("check.sectionsMiss") }
      : summaryMissing.length > 0
        ? {
            key: "sections",
            tab: "sections",
            state: written.length === 0 ? "miss" : "warn",
            text: t("check.sectionsSummary", { names: summaryMissing.map((s) => s.name).join(", "), locales: localeNames(missingIn) }),
          }
        : {
            key: "sections",
            tab: "sections",
            state: "ok",
            text: t("check.sectionsOk", { count: product.sections.length, assets: t("assets", { count: product.assetCount }) }),
          },
    blocked("noFile")
      ? { key: "file", tab: "versions", state: "miss", text: t("check.fileMiss", { version: version?.version ?? "1.0.0" }) }
      : { key: "file", tab: "versions", state: "ok", text: t("check.fileOk", { version: version?.version ?? "", count: version?._count.files ?? 0 }) },
  ];
  const stateOf = (tab: PackTab) => checks.find((c) => c.tab === tab)?.state;
  const initialTab = packTabFrom(search.tab);

  return (
    <>
      <header className="flex flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-850 text-ivory-500 sm:size-[72px]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin preview of pixel art, never resized
              <img src={mediaUrl(cover.key)} alt="" className="pixelated size-full object-cover" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-6" />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1
              className={title ? "font-heading text-xl text-pretty text-ivory-100" : "font-heading text-xl text-ivory-500"}
              data-testid="admin-product-title"
            >
              {title || t("untitled")}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ivory-500">
              <Badge variant={product.status === "PUBLISHED" ? "free" : "neutral"} data-testid="status-badge">
                {t(`status.${product.status}`)}
              </Badge>
              <span className={product.type === "FREE" ? "text-jade-400" : "text-gold-300"}>{t(`type.${product.type}`)}</span>
              <span className="break-all">/{product.slug}</span>
              {version && <span className="tabular-nums">· {t("versionShort", { version: version.version })}</span>}
            </div>
          </div>
        </div>
        <PackStatusActions
          productId={product.id}
          slug={product.slug}
          status={product.status}
          canPublish={product.blockers.length === 0}
          everPublished={product.publishedAt !== null}
        />
      </header>

      <PackEditor
        initialTab={initialTab}
        label={t("tabsLabel")}
        tabs={{
          info: { label: t("tabs.info") },
          content: { label: t("tabs.content"), state: stateOf("content") },
          media: { label: t("tabs.media"), count: gallery.length, state: stateOf("media") },
          sections: { label: t("tabs.sections"), count: product.sections.length, state: stateOf("sections") },
          versions: { label: t("tabs.versions"), count: version?.version, state: stateOf("versions") },
        }}
        aside={
          <PackChecklist
            title={product.status === "PUBLISHED" ? t("check.titleReady") : t("check.titleNeeded")}
            items={checks}
            actions={<PackDeleteButton productId={product.id} canDelete={product.canDelete} />}
            footer={
              product.canDelete ? undefined : (
                <p className="text-xs text-pretty text-ivory-500" data-testid="product-delete-note">
                  {t("deleteDisabled")}
                </p>
              )
            }
          />
        }
      >
        <PackPanel tabs={["info", "content"]}>
          <ProductForm
            action={updateProductAction.bind(null, product.id)}
            initial={initial}
            genres={taxonomy.genres}
            styles={taxonomy.styles}
            locked={product.locked}
          />
        </PackPanel>

        <PackPanel tabs={["media"]} className="flex flex-col gap-3">
          <PackCard testId="pack-media-card">
            <p className="text-xs text-pretty text-ivory-500">{tm("galleryIntro")}</p>
            <MediaManager
              productId={product.id}
              withCover
              items={gallery.map((m) => ({ id: m.id, kind: m.kind, url: mediaUrl(m.key), isPlaceholder: m.isPlaceholder }))}
            />
          </PackCard>
          <p className="text-xs text-pretty text-ivory-500">{t("autoSaved")}</p>
        </PackPanel>

        <PackPanel tabs={["sections"]} className="flex flex-col gap-3">
          <PackCard testId="admin-sections">
            <p className="text-xs text-ivory-500 tabular-nums" data-testid="admin-pack-totals">
              {product.sections.length === 0
                ? t("sectionsEmpty")
                : t("totals", { assets: t("assets", { count: product.assetCount }), formats: product.fileFormats.join(", ") || "—" })}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {product.sections.map((s) => {
                const missing = ADMIN_LOCALES.filter((l) => !s.translations.find((x) => x.locale === l)?.summary.trim());
                return (
                  <Link
                    key={s.id}
                    href={`/admin/products/${product.id}/sections/${s.id}`}
                    className="flex items-center gap-3 rounded-xl border border-bronze-700 bg-ink-950/40 p-3.5 transition-colors hover:border-bronze-500"
                    data-testid="admin-section-row"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300">
                      <CategoryIcon name={s.category.iconKey ?? ""} className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium text-ivory-100">{category(s.categoryId)?.name}</span>
                      <span className="text-xs text-ivory-500 tabular-nums">
                        {t("assets", { count: s.assetCount })}
                        {s.fileFormats.length > 0 && ` · ${s.fileFormats.join(", ")}`}
                      </span>
                      {missing.length > 0 && (
                        <span className="text-xs text-gold-400">
                          {t("missing", { locales: missing.map((l) => l.toUpperCase()).join(", ") })}
                        </span>
                      )}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ivory-500" />
                  </Link>
                );
              })}
              <AddSectionTile
                action={addSectionAction.bind(null, locale, product.id)}
                categories={remaining.map((c) => ({ id: c.id, name: c.name, iconKey: c.icon }))}
                label={t("addSectionTile")}
              />
            </div>
          </PackCard>
          <p className="text-xs text-pretty text-ivory-500">{t("autoSaved")}</p>
        </PackPanel>

        <PackPanel tabs={["versions"]}>
          <PackCard testId="pack-versions-card">
            <VersionPanel productId={product.id} versions={versions!} packPublished={product.publishedAt !== null} bare />
          </PackCard>
        </PackPanel>
      </PackEditor>
    </>
  );
}
