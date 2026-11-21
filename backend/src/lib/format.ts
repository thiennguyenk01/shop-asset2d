import type { Locale } from "@backend/i18n/routing";

/** BCP-47 tags used for number/date formatting per site locale. */
export const INTL_TAG: Record<Locale, string> = { vi: "vi-VN", en: "en-US", zh: "zh-CN" };

/**
 * Prices are always VND, never converted (CLAUDE.md §8) — only the formatting follows the locale:
 * vi "150.000 ₫" · en "₫150,000" · zh "₫150,000".
 */
export function formatVnd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_TAG[locale], { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
}

/** Whole-number percentage saved, e.g. sale price vs. original price. */
export function savingPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/**
 * Picks the translation for `locale`, falling back to Vietnamese, then to any row.
 * The storefront never relies on the fallback for a pack's texts: it hides a pack in a language it is not written
 * in (DECISIONS #39). The fallback serves names that must always show (cart, library, orders, Admin).
 */
export function pickTranslation<T extends { locale: string }>(rows: readonly T[], locale: Locale): T | undefined {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "vi") ?? rows[0];
}
