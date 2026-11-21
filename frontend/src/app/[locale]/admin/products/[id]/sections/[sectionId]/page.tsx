import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MediaManager } from "@/components/admin/media-manager";
import { PackCard } from "@/components/admin/pack-editor";
import { sectionTabFrom } from "@/components/admin/pack-tabs";
import { SectionForm, type SectionFormValues } from "@/components/admin/section-forms";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { ADMIN_LOCALES } from "@backend/lib/admin/product-rules";
import { requireAdminPage } from "@backend/auth/admin-page";
import { updateSectionAction } from "@backend/modules/product/admin-actions";
import { getAdminGallery } from "@backend/modules/product/admin-media-service";
import { getAdminProduct, getAdminSection, getAdminTaxonomy } from "@backend/modules/product/admin-service";
import { mediaUrl } from "@backend/storage/media-url";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

/** Ids are not known at build time: placeholder params keep the route buildable (CLAUDE.md §1). */
export function generateStaticParams() {
  return [{ id: "__none__", sectionId: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminProducts");
  return { title: t("sectionsTitle") };
}

/**
 * Edit one section of a pack (GĐ5.2) and its preview pictures (GĐ5.3). Tabs since 2026-11-21 (user request):
 * Info · Content · Pictures, the open one kept in `?tab=`; Save · Delete beside the title.
 */
export default function AdminSectionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/products/[id]/sections/[sectionId]">) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
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
  params: Promise<{ locale: string; id: string; sectionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const [{ locale: raw, id, sectionId }, sp] = await Promise.all([params, searchParams]);
  const locale = raw as Locale;
  const [product, section, taxonomy, gallery, t, tm] = await Promise.all([
    getAdminProduct(id, locale),
    getAdminSection(id, sectionId),
    getAdminTaxonomy(locale),
    getAdminGallery(id, sectionId),
    getTranslations("adminProducts"),
    getTranslations("adminMedia"),
  ]);
  if (!product) redirect({ href: "/admin/products", locale });
  if (!section) redirect({ href: `/admin/products/${id}`, locale });
  const s = section!;
  const packTitle =
    product!.translations.find((x) => x.locale === locale)?.title ||
    product!.translations.find((x) => x.locale === "vi")?.title ||
    product!.slug;
  const name = taxonomy.categories.find((c) => c.id === s.categoryId)?.name ?? s.category.slug;
  const tr = (l: string) => s.translations.find((x) => x.locale === l);
  const initial: SectionFormValues = {
    assetCount: s.assetCount,
    sortOrder: s.sortOrder,
    resolution: s.resolution ?? "",
    fileFormats: s.fileFormats,
    translations: Object.fromEntries(
      ADMIN_LOCALES.map((l) => [l, { summary: tr(l)?.summary ?? "", contentsList: tr(l)?.contentsList ?? [] }]),
    ) as SectionFormValues["translations"],
  };

  return (
    <>
      <Link
        href={`/admin/products/${id}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
        data-testid="admin-section-back"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("backToPack", { pack: packTitle })}
      </Link>
      <SectionForm
        action={updateSectionAction.bind(null, id, sectionId)}
        initial={initial}
        productId={id}
        sectionId={sectionId}
        initialTab={sectionTabFrom(sp.tab)}
        mediaCount={gallery.length}
        header={
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-ivory-100">{t("sectionTitle", { name })}</h1>
            <p className="text-sm text-pretty text-ivory-500">{t("sectionIntro", { pack: packTitle })}</p>
          </header>
        }
        gallery={
          <PackCard testId="section-gallery">
            <p className="text-xs text-pretty text-ivory-500">{tm("sectionGalleryIntro")}</p>
            <MediaManager
              productId={id}
              sectionId={sectionId}
              withCover={false}
              items={gallery.map((m) => ({
                id: m.id,
                kind: m.kind,
                url: mediaUrl(m.key),
                isPlaceholder: m.isPlaceholder,
              }))}
            />
            <p className="text-xs text-pretty text-ivory-500">{tm("sectionAutoSaved")}</p>
          </PackCard>
        }
      />
    </>
  );
}
