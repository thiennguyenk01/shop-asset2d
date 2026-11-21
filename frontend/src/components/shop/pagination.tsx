import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@backend/i18n/navigation";
import { pageWindow, shopQuery, type ShopParams } from "@backend/lib/catalog/shop-params";
import { cn } from "@/lib/cn";

/** Page / arrow boxes: h-9, transparent border always (no layout shift), current page = light fill. */
const box = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-transparent px-2 text-sm font-medium tabular-nums";
const idle = "text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100";

/**
 * Pagination (evondevKit small-controls.md "Phân trang"): one row, count on the left, controls on the
 * right; arrows stay in place and disable at the ends. One page only → count without controls.
 */
export async function Pagination({
  params,
  page,
  pageCount,
  summary,
}: {
  params: ShopParams;
  page: number;
  pageCount: number;
  summary: string;
}) {
  const t = await getTranslations("shop.pagination");
  const href = (p: number) => ({ pathname: "/shop" as const, query: shopQuery(params, { page: p }) });

  return (
    <div className="flex items-center justify-between gap-4 border-t border-bronze-700 pt-4">
      <p className="text-sm text-ivory-500 tabular-nums">{summary}</p>
      {pageCount > 1 && (
        <nav aria-label={t("label")} className="flex shrink-0 items-center gap-1">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" aria-label={t("previous")} className={cn(box, idle)}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(box, "text-ivory-100/25")}>
              <ChevronLeft aria-hidden="true" className="size-4" />
            </span>
          )}

          {pageWindow(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-ivory-500">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-label={t("page", { page: p })}
                aria-current={p === page ? "page" : undefined}
                className={cn(box, p === page ? "bg-ivory-100/10 text-ivory-100" : idle)}
              >
                {p}
              </Link>
            ),
          )}

          {page < pageCount ? (
            <Link href={href(page + 1)} rel="next" aria-label={t("next")} className={cn(box, idle)}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(box, "text-ivory-100/25")}>
              <ChevronRight aria-hidden="true" className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
