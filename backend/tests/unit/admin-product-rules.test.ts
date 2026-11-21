import { describe, expect, it } from "vitest";
import {
  canDeletePack,
  DRAFT_SLUG_PREFIX,
  draftInput,
  draftSlug,
  fieldErrors,
  missingWhilePublished,
  packTextLocales,
  packTotals,
  productFormData,
  productFormSchema,
  publishBlockers,
  sectionFormData,
  sectionFormSchema,
  sectionMissingWhilePublished,
  splitList,
  writtenLocales,
} from "@backend/lib/admin/product-rules";

function form(entries: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const x of [v].flat()) f.append(k, x);
  return f;
}

const text = { title: "Tiên Hiệp", shortDescription: "Ngắn", description: "Dài", contentsList: "Một\nHai\n\nHai" };
const base = {
  slug: "tien-hiep-moi",
  type: "PREMIUM",
  priceVnd: "150.000",
  compareAtPriceVnd: "",
  resolution: ["64×64 px", "32×32 px"],
  compatibleSoftware: ["unity", "Godot", "Unity", "Phần mềm riêng"],
  genreIds: ["g1"],
  ...Object.fromEntries(["vi", "en", "zh"].flatMap((l) => Object.entries(text).map(([k, v]) => [`${l}.${k}`, v]))),
};

describe("product form (GĐ5.2)", () => {
  it("parses a valid premium pack: price with separators, lists cleaned, unchecked box = false", () => {
    const r = productFormSchema.safeParse(productFormData(form(base)));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.priceVnd).toBe(150_000);
    expect(r.data.compareAtPriceVnd).toBeNull();
    expect(r.data.isFeatured).toBe(false);
    // Ticked chips; the list's spelling wins, duplicates dropped, a saved value outside the lists is kept.
    expect(r.data.compatibleSoftware).toEqual(["Unity", "Godot", "Phần mềm riêng"]);
    expect(r.data.resolution).toBe("64×64 px, 32×32 px");
    expect(r.data.translations.vi.contentsList).toEqual(["Một", "Hai"]);
    expect(r.data.genreIds).toEqual(["g1"]);
  });

  it("slug: lowercase words joined by single dashes, 3–80 chars", () => {
    for (const slug of ["Tien Hiep", "tien--hiep", "-tien", "ab", "tiên-hiệp", "a".repeat(81)]) {
      const r = productFormSchema.safeParse(productFormData(form({ ...base, slug })));
      expect(r.success, slug).toBe(false);
      if (!r.success) expect(fieldErrors(r.error).slug).toBe("slugFormat");
    }
    expect(productFormSchema.safeParse(productFormData(form({ ...base, slug: "TIEN-HIEP-2" }))).success).toBe(true); // lowercased
  });

  it("price rules: FREE is 0 ₫, PREMIUM > 0 ₫, compare-at above the price and never on FREE", () => {
    const err = (over: Record<string, string>) => {
      const r = productFormSchema.safeParse(productFormData(form({ ...base, ...over })));
      return r.success ? null : fieldErrors(r.error);
    };
    expect(err({ type: "FREE", priceVnd: "10000" })?.priceVnd).toBe("priceFree");
    expect(err({ type: "FREE", priceVnd: "" })).toBeNull();
    expect(err({ priceVnd: "0" })?.priceVnd).toBe("pricePremium");
    expect(err({ priceVnd: "abc" })?.priceVnd).toBe("number");
    expect(err({ priceVnd: "100000001" })?.priceVnd).toBe("priceTooHigh");
    expect(err({ compareAtPriceVnd: "150000" })?.compareAtPriceVnd).toBe("compareAt");
    expect(err({ compareAtPriceVnd: "199000" })).toBeNull();
    expect(err({ type: "FREE", priceVnd: "0", compareAtPriceVnd: "1000" })?.compareAtPriceVnd).toBe("compareAt");
  });

  it("texts are length-limited per field", () => {
    const r = productFormSchema.safeParse(productFormData(form({ ...base, "en.title": "x".repeat(121) })));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)["translations.en.title"]).toBe("tooLong");
  });

  it("section form: counts are whole numbers, formats upper-cased and deduplicated", () => {
    const r = sectionFormSchema.safeParse(
      sectionFormData(form({ assetCount: "1.200", sortOrder: "2", fileFormats: ["png", "Gif", "PNG", "Aseprite"], "vi.summary": "Tóm tắt" })),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.assetCount).toBe(1200);
      expect(r.data.fileFormats).toEqual(["PNG", "GIF", "ASEPRITE"]);
      expect(r.data.resolution).toBe(""); // nothing ticked
      expect(r.data.translations.en.summary).toBe("");
    }
    const bad = sectionFormSchema.safeParse(sectionFormData(form({ assetCount: "-3" })));
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error).assetCount).toBe("number");
  });

  it("splitList trims, drops empties and duplicates", () => {
    expect(splitList(" a, b ,, a\nc ")).toEqual(["a", "b", "c"]);
  });
});

describe("publishing (GĐ5.2)", () => {
  const full = (l: string) => ({ locale: l, title: "T", shortDescription: "S", description: "D" });
  const section = (name: string, locales = ["vi", "en", "zh"]) => ({ name, translations: locales.map((l) => ({ locale: l, summary: "x" })) });

  it("a complete pack with a file has no blockers", () => {
    expect(publishBlockers({ translations: ["vi", "en", "zh"].map(full), sections: [section("Nhân vật")], hasFile: true, hasCover: true })).toEqual([]);
  });

  it("one fully written language is enough to publish (DECISIONS #39)", () => {
    for (const l of ["vi", "en", "zh"])
      expect(publishBlockers({ translations: [full(l)], sections: [section("Nhân vật", [l])], hasFile: true, hasCover: true }), l).toEqual([]);
  });

  it("blocks when no language is written end to end, and lists the lack of sections, of a cover and of a file", () => {
    // VI pack texts but the section only in EN; EN section but no EN pack texts → nothing written end to end.
    expect(
      publishBlockers({ translations: [full("vi"), { ...full("en"), description: "  " }], sections: [section("Nhân vật", ["en"])], hasFile: false, hasCover: false }),
    ).toEqual([{ key: "noLanguage" }, { key: "noCover" }, { key: "noFile" }]);
    expect(publishBlockers({ translations: [full("en")], sections: [], hasFile: true, hasCover: true })).toEqual([{ key: "noSections" }]);
    expect(publishBlockers({ translations: [], sections: [], hasFile: true, hasCover: true })).toEqual([{ key: "noLanguage" }, { key: "noSections" }]);
  });

  it("written languages: the pack's three texts decide where it shows; sections decide where it can be published", () => {
    const translations = [full("vi"), full("en"), { ...full("zh"), title: " " }];
    expect(packTextLocales(translations)).toEqual(["vi", "en"]);
    expect(writtenLocales({ translations, sections: [section("A", ["vi", "zh"]), section("B", ["vi", "en"])] })).toEqual(["vi"]);
  });

  it("a pack on sale keeps one language with its texts; a section keeps one summary", () => {
    const parsed = (over: Record<string, string>) => {
      const r = productFormSchema.safeParse(
        productFormData(form({ ...base, "en.title": "", "en.shortDescription": "", "en.description": "", "zh.title": "", "zh.shortDescription": "", "zh.description": "", ...over })),
      );
      if (!r.success) throw new Error("parse");
      return r.data;
    };
    expect(missingWhilePublished(parsed({}), ["vi"])).toEqual({}); // VI still written
    expect(missingWhilePublished(parsed({ "vi.description": "" }), ["vi"])).toEqual({ "translations.vi.description": "required" });
    expect(missingWhilePublished(parsed({ "vi.title": "", "en.title": "T" }), [])).toEqual({ "translations.vi.title": "required" }); // none live → VI
    const sec = (over: Record<string, string>) => {
      const r = sectionFormSchema.safeParse(sectionFormData(form({ assetCount: "1", sortOrder: "0", ...over })));
      if (!r.success) throw new Error("parse");
      return r.data;
    };
    expect(sectionMissingWhilePublished(sec({ "zh.summary": "摘要" }))).toEqual({});
    expect(Object.keys(sectionMissingWhilePublished(sec({})))).toEqual(["translations.vi.summary", "translations.en.summary", "translations.zh.summary"]);
  });

  it("pack totals are the sum / union of its sections", () => {
    expect(packTotals([{ assetCount: 10, fileFormats: ["PNG", "GIF"] }, { assetCount: 5, fileFormats: ["PNG", "WAV"] }])).toEqual({
      assetCount: 15,
      fileFormats: ["PNG", "GIF", "WAV"],
    });
    expect(packTotals([])).toEqual({ assetCount: 0, fileFormats: [] });
  });

  it("only a pack nobody bought, owns or holds credits for can be deleted", () => {
    expect(canDeletePack({ orderItems: 0, entitlements: 0, downloadCredits: 0 })).toBe(true);
    expect(canDeletePack({ orderItems: 1, entitlements: 0, downloadCredits: 0 })).toBe(false);
    expect(canDeletePack({ orderItems: 0, entitlements: 1, downloadCredits: 0 })).toBe(false);
    expect(canDeletePack({ orderItems: 0, entitlements: 0, downloadCredits: 1 })).toBe(false);
  });
});

describe("new pack = empty draft (2026-11-21)", () => {
  it("temporary link: bo-moi- + 4 easy-to-read characters, a valid slug", () => {
    const seq = [0, 0.5, 0.99, 0.2];
    let i = 0;
    const slug = draftSlug(() => seq[i++ % seq.length]);
    expect(slug).toMatch(/^bo-moi-[a-km-np-z2-9]{4}$/);
    expect(slug.startsWith(DRAFT_SLUG_PREFIX)).toBe(true);
  });

  it("starts as a FREE pack at 0 ₫ with no texts (the database only takes a Premium pack with a price)", () => {
    const d = draftInput("bo-moi-abcd");
    expect(d).toMatchObject({ slug: "bo-moi-abcd", type: "FREE", priceVnd: 0, compareAtPriceVnd: null, genreIds: [], compatibleSoftware: [] });
    expect(packTextLocales(["vi", "en", "zh"].map((locale) => ({ locale, ...d.translations[locale as "vi"] })))).toEqual([]);
  });
});
