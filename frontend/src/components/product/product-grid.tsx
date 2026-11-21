import type { ProductCardData } from "@backend/modules/product/queries";
import { cn } from "@/lib/cn";
import { ProductCard } from "./product-card";

/**
 * evondevKit entity-grid: 2 columns from the phone up (user request 2026-11-21) → 3 → 4 on very wide screens (fill
 * width with columns, not wider cards).
 */
const GRID_COLS = "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4";

export function ProductGrid({ products, className }: { products: ProductCardData[]; className?: string }) {
  return (
    <ul className={cn(GRID_COLS, className)}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}

/** Loading placeholder with the same footprint as the grid. */
export function ProductGridSkeleton({ count = 6, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      <ul className={GRID_COLS} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-2xl border border-bronze-700 bg-ink-900">
            <div className="aspect-[4/3] animate-pulse bg-ink-800" />
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-ink-800" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-ink-800" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-ink-800" />
              <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-ink-800" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
