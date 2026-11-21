import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_IMAGE,
  isShareableImage,
  languageAlternates,
  packLocales,
  pageAlternates,
  robotsFor,
  shareMetadata,
  sitemapEntries,
} from "@backend/lib/seo/seo";

/** GĐ7.3 — canonical / hreflang, link previews, robots.txt and sitemap.xml. */
describe("language alternates", () => {
  it("one link per language the page exists in (zh as zh-CN), x-default = Vietnamese", () => {
    expect(languageAlternates("/shop", ["vi", "en", "zh"])).toEqual({
      vi: "/vi/shop",
      en: "/en/shop",
      "zh-CN": "/zh/shop",
      "x-default": "/vi/shop",
    });
  });

  it("a pack written in English only links English, and x-default falls back to it", () => {
    expect(languageAlternates("/product/x", ["en"])).toEqual({ en: "/en/product/x", "x-default": "/en/product/x" });
    expect(languageAlternates("/product/x", ["zh", "en"])).toEqual({
      en: "/en/product/x",
      "zh-CN": "/zh/product/x",
      "x-default": "/en/product/x",
    });
  });

  it("canonical is the page in its own language; absolute URLs when a base is given", () => {
    expect(pageAlternates("en", "/shop", ["vi", "en"])).toEqual({
      canonical: "/en/shop",
      languages: { vi: "/vi/shop", en: "/en/shop", "x-default": "/vi/shop" },
    });
    expect(languageAlternates("/shop", ["vi"], "https://shop.example")).toEqual({
      vi: "https://shop.example/vi/shop",
      "x-default": "https://shop.example/vi/shop",
    });
  });
});

describe("link previews", () => {
  it("a page picture → large card; none → the site icon as a small card", () => {
    const withImage = shareMetadata({ locale: "vi", siteName: "S", title: "T", description: "D", path: "/product/x", image: "/media/a.png" });
    expect(withImage.openGraph).toMatchObject({
      type: "website",
      siteName: "S",
      locale: "vi_VN",
      alternateLocale: ["en_US", "zh_CN"],
      url: "/vi/product/x",
      images: ["/media/a.png"],
    });
    expect(withImage.twitter).toMatchObject({ card: "summary_large_image", images: ["/media/a.png"] });

    const plain = shareMetadata({ locale: "zh", siteName: "S", title: "T", description: "D" });
    expect(plain.openGraph).toMatchObject({ locale: "zh_CN", images: [DEFAULT_SHARE_IMAGE] });
    expect(plain.openGraph).not.toHaveProperty("url");
    expect(plain.twitter).toMatchObject({ card: "summary" });
  });

  it("only image types previews can show (not SVG demo pictures)", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) expect(isShareableImage(t)).toBe(true);
    for (const t of ["image/svg+xml", "video/mp4"]) expect(isShareableImage(t)).toBe(false);
  });
});

describe("robots.txt", () => {
  it("production: crawlable except the API and Admin, with the sitemap", () => {
    expect(robotsFor("production", "https://shop.example")).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/vi/admin", "/en/admin", "/zh/admin"] },
      sitemap: "https://shop.example/sitemap.xml",
    });
  });
  it("development, test runs and previews: nothing may be crawled", () => {
    for (const env of ["development", "test", "preview"]) {
      expect(robotsFor(env, "https://preview.example")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }
  });
});

describe("sitemap.xml", () => {
  it("groups slugs by the languages they are visible in", () => {
    expect(packLocales({ vi: ["b", "a"], en: ["a"], zh: [] })).toEqual([
      { slug: "a", locales: ["vi", "en"] },
      { slug: "b", locales: ["vi"] },
    ]);
  });

  it("the shop in 3 languages, each pack only in its languages, with absolute alternates", () => {
    const entries = sitemapEntries("https://shop.example/", [{ slug: "a", locales: ["en", "vi"] }]);
    expect(entries.map((e) => e.url)).toEqual([
      "https://shop.example/vi/shop",
      "https://shop.example/en/shop",
      "https://shop.example/zh/shop",
      "https://shop.example/vi/product/a",
      "https://shop.example/en/product/a",
    ]);
    expect(entries[3].alternates?.languages).toEqual({
      vi: "https://shop.example/vi/product/a",
      en: "https://shop.example/en/product/a",
      "x-default": "https://shop.example/vi/product/a",
    });
  });
});
