import { getLocale, getTranslations } from "next-intl/server";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd, savingPercent } from "@backend/lib/format";
import type { ProductCardData } from "@backend/modules/product/queries";
import { ProductThumb } from "./product-thumb";

export const TYPE_BADGE: Record<ProductCardData["type"], { variant: BadgeVariant; key: "free" | "premium" }> = {
  FREE: { variant: "free", key: "free" },
  PREMIUM: { variant: "premium", key: "premium" },
};

/**
 * Pack card (evondevKit layouts/app/entity-grid.md): picture on top at a fixed 4:3, then the things buyers
 * compare packs by — name, genres, "complete A→Z · N sections · assets", price. No shadow; the whole card is
 * one link (overlay on the title link). Cards in a row share a height (grid default).
 */
export async function ProductCard({ product, priority }: { product: ProductCardData; priority?: boolean }) {
  const [t, tc, tp, locale] = await Promise.all([
    getTranslations("product"),
    getTranslations("common"),
    getTranslations("productPage"),
    getLocale(),
  ]);
  const badge = TYPE_BADGE[product.type];
  const saving = savingPercent(product.priceVnd, product.compareAtPriceVnd);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-bronze-700 bg-ink-900 transition-colors hover:border-bronze-500">
      <ProductThumb
        thumbnail={product.thumbnail}
        alt={product.title}
        demoLabel={t("demoImage")}
        noImageLabel={t("noImage")}
        priority={priority}
      />
      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 sm:top-3 sm:left-3">
        <Badge variant={badge.variant}>{tc(badge.key)}</Badge>
        {saving !== null && <Badge variant="neutral">{t("saving", { percent: saving })}</Badge>}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-ivory-100">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>
        {product.genres.length > 0 && (
          <p className="truncate text-xs leading-normal text-ivory-500">{product.genres.join(" · ")}</p>
        )}
        <p className="text-xs leading-normal">
          <span className="text-jade-400">
            {tp("packBadge")} · {t("sections", { count: product.sectionCount })}
          </span>
          {product.assetCount > 0 && (
            <span className="text-ivory-500"> · {t("assets", { count: product.assetCount })}</span>
          )}
        </p>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pt-3">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gold-300 tabular-nums sm:text-base" data-testid="card-price">
              {/* A free pack shows "FREE", not "0 ₫" (user request 2026-11-20). */}
              {product.type === "FREE" ? tc("freePrice") : formatVnd(product.priceVnd, locale as Locale)}
            </span>
            {product.compareAtPriceVnd !== null && (
              <span className="text-xs text-ivory-500 tabular-nums line-through">
                <span className="sr-only">{t("compareAt", { price: "" })}</span>
                {formatVnd(product.compareAtPriceVnd, locale as Locale)}
              </span>
            )}
          </div>
          {product.isDemoData && <span className="text-xs text-ivory-500">{t("demoData")}</span>}
        </div>
      </div>
    </article>
  );
}
