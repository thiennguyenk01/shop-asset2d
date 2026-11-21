import { z } from "zod";
import {
  FILE_FORMAT_GROUPS,
  RESOLUTION_GROUPS,
  RESOLUTION_SEPARATOR,
  SOFTWARE_GROUPS,
  canonical,
  type SpecGroup,
} from "./spec-options";

/**
 * Admin pack editing (GĐ5.2) — pure rules, unit-tested; the service applies them and the database CHECKs
 * (FREE = 0 ₫, PREMIUM > 0 ₫, compare-at > price) back them up.
 *
 * - Content needs only ONE language (user request 2026-11-20, DECISIONS #39): a pack can be published once one of
 *   VI/EN/ZH is fully written (title, short description, description, and every section's summary). The other
 *   languages are added later; until a language has the pack's texts, the storefront hides the pack in it.
 * - A pack on sale needs at least one section and a file in its current version (otherwise nobody could
 *   download what they paid for).
 * - Once published, the slug (links, bookmarks) and the type (orders, terms) no longer change.
 */
export const ADMIN_LOCALES = ["vi", "en", "zh"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PRICE_MAX_VND = 100_000_000;
const TEXT_MAX = { title: 120, short: 300, description: 5000, item: 200, items: 40, list: 300 } as const;

/** Error keys are translation keys under `adminProducts.errors`. */
export type ProductFieldError =
  | "slugFormat"
  | "slugTaken"
  | "priceFree"
  | "pricePremium"
  | "priceTooHigh"
  | "compareAt"
  | "tooLong"
  | "number"
  | "required";

const optionalText = (max: number) => z.string().trim().max(max, { message: "tooLong" });

/**
 * A spec picked from ready-made chips (resolution, software, file formats; `spec-options.ts`): each ticked chip is
 * one form value; a value may also hold a comma list (older text field, tests). Listed values take the list's
 * spelling; others are kept as typed. At most 20, each at most 60 characters.
 */
const specList = (groups: readonly SpecGroup[]) =>
  z
    .array(z.string().max(300, { message: "tooLong" }))
    .max(60, { message: "tooLong" })
    .transform((v) => {
      const byKey = new Map<string, string>(); // first spelling wins, case ignored
      for (const x of v.flatMap((y) => splitList(y, /,/)).map((y) => canonical(groups, y)))
        if (!byKey.has(x.toLowerCase())) byKey.set(x.toLowerCase(), x);
      return [...byKey.values()];
    })
    .pipe(z.array(z.string().max(60, { message: "tooLong" })).max(20, { message: "tooLong" }));

/** "a, b , ,c" → ["a","b","c"] (deduplicated, order kept). */
export function splitList(raw: string, separator: RegExp = /[,\n]/): string[] {
  return [...new Set(raw.split(separator).map((s) => s.trim()).filter(Boolean))];
}

const intField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const digits = v.replace(/[.\s,_]/g, ""); // "150.000" → 150000
    if (digits === "") return null;
    if (!/^\d+$/.test(digits)) {
      ctx.addIssue({ code: "custom", message: "number" });
      return z.NEVER;
    }
    return Number(digits);
  });

const translationSchema = z.object({
  title: optionalText(TEXT_MAX.title),
  shortDescription: optionalText(TEXT_MAX.short),
  description: optionalText(TEXT_MAX.description),
  contentsList: z
    .string()
    .max(TEXT_MAX.list * TEXT_MAX.items, { message: "tooLong" })
    .transform((v) => splitList(v, /\n/).slice(0, TEXT_MAX.items)),
});

export const productFormSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(SLUG_RE, { message: "slugFormat" }).min(3, { message: "slugFormat" }).max(80, { message: "slugFormat" }),
    type: z.enum(["FREE", "PREMIUM"]),
    priceVnd: intField,
    compareAtPriceVnd: intField,
    isFeatured: z.boolean(),
    resolution: specList(RESOLUTION_GROUPS).transform((v) => v.join(RESOLUTION_SEPARATOR)),
    compatibleSoftware: specList(SOFTWARE_GROUPS),
    genreIds: z.array(z.string().max(64)).max(30),
    artStyleIds: z.array(z.string().max(64)).max(30),
    translations: z.object({ vi: translationSchema, en: translationSchema, zh: translationSchema }),
  })
  .superRefine((v, ctx) => {
    const price = v.priceVnd ?? 0;
    if (v.type === "FREE" && price !== 0) ctx.addIssue({ code: "custom", path: ["priceVnd"], message: "priceFree" });
    if (v.type === "PREMIUM" && price <= 0) ctx.addIssue({ code: "custom", path: ["priceVnd"], message: "pricePremium" });
    if (price > PRICE_MAX_VND) ctx.addIssue({ code: "custom", path: ["priceVnd"], message: "priceTooHigh" });
    if (v.compareAtPriceVnd !== null && (v.type === "FREE" || v.compareAtPriceVnd <= price))
      ctx.addIssue({ code: "custom", path: ["compareAtPriceVnd"], message: "compareAt" });
  })
  .transform((v) => ({ ...v, priceVnd: v.type === "FREE" ? 0 : (v.priceVnd ?? 0) }));

export type ProductFormInput = z.infer<typeof productFormSchema>;

/**
 * "New pack" creates an empty draft at once and opens the full editor (user request 2026-11-21: pictures,
 * sections and files must not wait for a first save). The draft gets a temporary link `bo-moi-xxxx` (changeable
 * until the pack is first published) and starts as FREE at 0 ₫: the database only accepts a Premium pack with a
 * price, so the Admin switches to Premium when typing the price.
 */
export const DRAFT_SLUG_PREFIX = "bo-moi-";
export function draftSlug(random: () => number = Math.random): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/1/o/0: read aloud or retyped without mistakes
  return DRAFT_SLUG_PREFIX + Array.from({ length: 4 }, () => abc[Math.floor(random() * abc.length) % abc.length]).join("");
}
export function draftInput(slug: string): ProductFormInput {
  const empty = { title: "", shortDescription: "", description: "", contentsList: [] };
  return {
    slug,
    type: "FREE",
    priceVnd: 0,
    compareAtPriceVnd: null,
    isFeatured: false,
    resolution: "",
    compatibleSoftware: [],
    genreIds: [],
    artStyleIds: [],
    translations: { vi: empty, en: empty, zh: empty },
  };
}

export const sectionFormSchema = z.object({
  assetCount: intField.transform((v) => v ?? 0).pipe(z.number().int().min(0, { message: "number" }).max(1_000_000, { message: "number" })),
  sortOrder: intField.transform((v) => v ?? 0).pipe(z.number().int().min(0, { message: "number" }).max(1000, { message: "number" })),
  resolution: specList(RESOLUTION_GROUPS).transform((v) => v.join(RESOLUTION_SEPARATOR)),
  fileFormats: specList(FILE_FORMAT_GROUPS).transform((v) => [...new Set(v.map((f) => f.toUpperCase()))]),
  translations: z.object({
    vi: z.object({ summary: optionalText(600), contentsList: translationSchema.shape.contentsList }),
    en: z.object({ summary: optionalText(600), contentsList: translationSchema.shape.contentsList }),
    zh: z.object({ summary: optionalText(600), contentsList: translationSchema.shape.contentsList }),
  }),
});
export type SectionFormInput = z.infer<typeof sectionFormSchema>;

/** Read the product form (field names as rendered by the admin form) into the schema's input shape. */
export function productFormData(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "");
  const all = (k: string) => form.getAll(k).map(String);
  return {
    slug: s("slug"),
    type: s("type"),
    priceVnd: s("priceVnd"),
    compareAtPriceVnd: s("compareAtPriceVnd"),
    isFeatured: form.get("isFeatured") === "on",
    resolution: all("resolution"),
    compatibleSoftware: all("compatibleSoftware"),
    genreIds: form.getAll("genreIds").map(String),
    artStyleIds: form.getAll("artStyleIds").map(String),
    translations: Object.fromEntries(
      ADMIN_LOCALES.map((l) => [
        l,
        { title: s(`${l}.title`), shortDescription: s(`${l}.shortDescription`), description: s(`${l}.description`), contentsList: s(`${l}.contentsList`) },
      ]),
    ),
  };
}

export function sectionFormData(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "");
  const all = (k: string) => form.getAll(k).map(String);
  return {
    assetCount: s("assetCount"),
    sortOrder: s("sortOrder"),
    resolution: all("resolution"),
    fileFormats: all("fileFormats"),
    translations: Object.fromEntries(ADMIN_LOCALES.map((l) => [l, { summary: s(`${l}.summary`), contentsList: s(`${l}.contentsList`) }])),
  };
}

/** First error per field, as `{ "translations.vi.title": "tooLong" }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message in ERROR_KEYS ? issue.message : "tooLong";
  }
  return out;
}
const ERROR_KEYS: Record<ProductFieldError, true> = {
  slugFormat: true,
  slugTaken: true,
  priceFree: true,
  pricePremium: true,
  priceTooHigh: true,
  compareAt: true,
  tooLong: true,
  number: true,
  required: true,
};

/** What still stops a pack from going on sale (keys under `adminProducts.blockers`). */
export type PublishBlocker = { key: "noLanguage" } | { key: "noSections" } | { key: "noFile" } | { key: "noCover" };

type PackTexts = { locale: string; title: string; shortDescription: string; description: string };

/**
 * Languages in which the pack's own texts (title, short description, description) are written. The storefront
 * shows a pack in exactly these languages (`writtenIn` in product/queries.ts is the same rule as a DB filter).
 */
export function packTextLocales(translations: readonly PackTexts[]): AdminLocale[] {
  return ADMIN_LOCALES.filter((l) => {
    const t = translations.find((x) => x.locale === l);
    return !!t && !!t.title.trim() && !!t.shortDescription.trim() && !!t.description.trim();
  });
}

/** Languages fully written: the pack's texts and the summary of every section. */
export function writtenLocales(p: Pick<PublishCheckInput, "translations" | "sections">): AdminLocale[] {
  return packTextLocales(p.translations).filter((l) => p.sections.every((s) => !!s.translations.find((x) => x.locale === l)?.summary.trim()));
}

export type PublishCheckInput = {
  translations: { locale: string; title: string; shortDescription: string; description: string }[];
  sections: { name: string; translations: { locale: string; summary: string }[] }[];
  hasFile: boolean;
  /** The pack gallery has a cover image (CLAUDE.md §9: thumbnail is required). */
  hasCover: boolean;
};

export function publishBlockers(p: PublishCheckInput): PublishBlocker[] {
  const out: PublishBlocker[] = [];
  if (writtenLocales(p).length === 0) out.push({ key: "noLanguage" });
  if (p.sections.length === 0) out.push({ key: "noSections" });
  if (!p.hasCover) out.push({ key: "noCover" });
  if (!p.hasFile) out.push({ key: "noFile" });
  return out;
}

const PACK_TEXT_FIELDS = ["title", "shortDescription", "description"] as const;

/**
 * A pack on sale must stay visible in at least one language. If a save would leave no language with the pack's
 * texts, the empty fields of the languages it is shown in today (`liveLocales`; VI if none) become `required`.
 */
export function missingWhilePublished(input: ProductFormInput, liveLocales: readonly AdminLocale[]): Record<string, "required"> {
  const rows = ADMIN_LOCALES.map((locale) => ({ locale, ...input.translations[locale] }));
  if (packTextLocales(rows).length > 0) return {};
  const out: Record<string, "required"> = {};
  for (const l of liveLocales.length > 0 ? liveLocales : (["vi"] as const))
    for (const f of PACK_TEXT_FIELDS) if (!input.translations[l][f]) out[`translations.${l}.${f}`] = "required";
  return out;
}

/** A section of a pack on sale keeps its summary in at least one language. */
export function sectionMissingWhilePublished(input: SectionFormInput): Record<string, "required"> {
  if (ADMIN_LOCALES.some((l) => input.translations[l].summary)) return {};
  return Object.fromEntries(ADMIN_LOCALES.map((l) => [`translations.${l}.summary`, "required" as const]));
}

/** Totals shown on the pack = sum / union of its sections (CLAUDE.md §4). */
export function packTotals(sections: { assetCount: number; fileFormats: string[] }[]): { assetCount: number; fileFormats: string[] } {
  return {
    assetCount: sections.reduce((n, s) => n + s.assetCount, 0),
    fileFormats: [...new Set(sections.flatMap((s) => s.fileFormats))],
  };
}

/** A pack can be deleted only while nothing refers to it (never sold, owned, or credited); otherwise hide it. */
export function canDeletePack(p: { orderItems: number; entitlements: number; downloadCredits: number }): boolean {
  return p.orderItems === 0 && p.entitlements === 0 && p.downloadCredits === 0;
}
