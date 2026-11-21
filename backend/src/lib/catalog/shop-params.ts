/**
 * Shop URL parameters (CLAUDE.md §5.2): parsing + building.
 * Pure functions — shared by the server (queries) and the UI (filter links), and unit-tested.
 * Unknown or malformed values are dropped instead of erroring, so hand-edited URLs never crash the page.
 */

export const SHOP_SORTS = ["newest", "bestselling", "price-asc", "price-desc"] as const;
export const SHOP_TYPES = ["free", "premium"] as const;
/** Price filter: free-form VND range from the toolbar slider (`?min=…&max=…`). */
export const PRICE_STEP = 50_000;
const PRICE_SLIDER_UNIT = 500_000;
const MAX_PRICE = 1_000_000_000;
/** 12 divides the 2-, 3- and 4-column grids evenly. */
export const SHOP_PAGE_SIZE = 12;

export type ShopSort = (typeof SHOP_SORTS)[number];
export type ShopType = (typeof SHOP_TYPES)[number];

export type ShopParams = {
  q?: string;
  genre?: string;
  style?: string;
  type?: ShopType;
  /** VND, inclusive. Undefined = no bound. */
  min?: number;
  max?: number;
  sort: ShopSort;
  page: number;
};

export const DEFAULT_SORT: ShopSort = "newest";
const FILTER_KEYS = ["q", "genre", "style", "type", "min", "max"] as const;
/** Chip keys: min/max are shown (and removed) together as one "price" chip. */
export type ShopFilterKey = "q" | "genre" | "style" | "type" | "price";

type RawParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_QUERY = 100;
const MAX_PAGE = 1000;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" ? v : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseShopParams(raw: RawParams): ShopParams {
  const q = first(raw.q)?.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  const slug = (key: string) => {
    const v = first(raw[key])?.trim().toLowerCase();
    return v && SLUG.test(v) ? v : undefined;
  };
  const pageNum = Number.parseInt(first(raw.page) ?? "1", 10);
  const price = (key: string) => {
    const v = first(raw[key])?.trim();
    if (!v || !/^\d{1,10}$/.test(v)) return undefined;
    const n = Number(v);
    return n > 0 && n <= MAX_PRICE ? n : undefined;
  };
  let min = price("min");
  let max = price("max");
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];

  return {
    q: q || undefined,
    genre: slug("genre"),
    style: slug("style"),
    type: oneOf(first(raw.type), SHOP_TYPES),
    min,
    max,
    sort: oneOf(first(raw.sort), SHOP_SORTS) ?? DEFAULT_SORT,
    page: Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_PAGE) : 1,
  };
}

/**
 * Query object for a shop link. Changing any filter or the sort resets to page 1;
 * only an explicit `page` in the patch keeps paging. Defaults are omitted to keep URLs short.
 */
export function shopQuery(current: ShopParams, patch: Partial<ShopParams> = {}): Record<string, string> {
  const resetsPage = Object.keys(patch).some((k) => k !== "page");
  const next: ShopParams = { ...current, ...patch, page: patch.page ?? (resetsPage ? 1 : current.page) };
  const query: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = next[key];
    if (value) query[key] = String(value);
  }
  if (next.sort !== DEFAULT_SORT) query.sort = next.sort;
  if (next.page > 1) query.page = String(next.page);
  return query;
}

export type ActiveFilter = { key: ShopFilterKey; value: string; remove: Partial<ShopParams> };

/** Active filters (for "remove filter" chips). The price range is one chip. */
export function activeFilters(params: ShopParams): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const key of ["q", "genre", "style", "type"] as const) {
    const value = params[key];
    if (value) out.push({ key, value, remove: { [key]: undefined } });
  }
  if (params.min !== undefined || params.max !== undefined) {
    out.push({ key: "price", value: `${params.min ?? ""}-${params.max ?? ""}`, remove: { min: undefined, max: undefined } });
  }
  return out;
}

/** Right end of the price slider: the highest published price rounded up to 500.000 ₫ (at least 500.000 ₫). */
export function priceSliderMax(highestPrice: number): number {
  return Math.max(PRICE_SLIDER_UNIT, Math.ceil(highestPrice / PRICE_SLIDER_UNIT) * PRICE_SLIDER_UNIT);
}

/** Lowercase, strip Vietnamese diacritics, keep [a-z0-9-] — lets "tien hiep" match slug "tien-hiep-dao-mon". */
export function toSearchSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Page numbers to show: first, last, current ±1, with gaps ("…"). */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ["gap" as const, p] : [p]));
}
