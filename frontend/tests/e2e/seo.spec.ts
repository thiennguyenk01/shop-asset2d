import { expect, test } from "./fixtures";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * GĐ7.3 — search engines and link previews (backend/src/lib/seo/seo.ts), and what each page sends to the browser.
 * The E2E server runs with APP_ENV=test: robots.txt must keep crawlers out (only production may be crawled).
 */
const PACK = "tien-hiep-dao-mon";
const head = async (request: import("./fixtures").APIRequestContext, path: string) => {
  const html = await (await request.get(path)).text();
  return html.slice(0, html.indexOf("</head>"));
};
const links = (h: string, rel: string) => [...h.matchAll(new RegExp(`<link rel="${rel}"[^>]*>`, "g"))].map((m) => m[0]);
const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const meta = (h: string, prop: string) => attr(new RegExp(`<meta (?:property|name)="${prop}"[^>]*>`).exec(h)?.[0] ?? "", "content");

test.describe("SEO", () => {
  test("robots.txt: nothing may be crawled outside production", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/Disallow: \/\s*$/m);
    expect(text).not.toContain("Sitemap:");
  });

  test("sitemap.xml: the shop in 3 languages and each pack, with the other languages as alternates", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const l of ["vi", "en", "zh"]) {
      expect(xml).toMatch(new RegExp(`<loc>https?://[^<]+/${l}/shop</loc>`));
      expect(xml).toMatch(new RegExp(`<loc>https?://[^<]+/${l}/product/${PACK}</loc>`));
    }
    expect(xml).toContain('hreflang="zh-CN"');
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).not.toMatch(/\/(admin|account|cart|checkout|login)/);
  });

  test("shop and pack pages: canonical, hreflang for each language (zh-CN), x-default = Vietnamese", async ({ request }) => {
    for (const [path, own] of [
      ["/en/shop", "/en/shop"],
      [`/vi/product/${PACK}`, `/vi/product/${PACK}`],
    ] as const) {
      const h = await head(request, path);
      const canonical = links(h, "canonical");
      expect(canonical, path).toHaveLength(1);
      expect(attr(canonical[0], "href"), path).toMatch(new RegExp(`${own}$`));
      const alternates = Object.fromEntries(links(h, "alternate").map((t) => [attr(t, "hrefLang"), attr(t, "href")]));
      const tail = own.replace(/^\/(vi|en)/, "");
      expect(alternates.vi, path).toMatch(new RegExp(`/vi${tail}$`));
      expect(alternates.en, path).toMatch(new RegExp(`/en${tail}$`));
      expect(alternates["zh-CN"], path).toMatch(new RegExp(`/zh${tail}$`));
      expect(alternates["x-default"], path).toMatch(new RegExp(`/vi${tail}$`));
    }
    // No competing automatic `Link` header (it used to list every language for every page).
    const res = await request.get("/vi/shop");
    expect(res.headers()["link"] ?? "").not.toContain('rel="alternate"');
  });

  test("link previews: title, description, language, picture", async ({ request }) => {
    const h = await head(request, `/en/product/${PACK}`);
    expect(meta(h, "og:title")).toBeTruthy();
    expect(meta(h, "og:description")).toBeTruthy();
    expect(meta(h, "og:locale")).toBe("en_US");
    expect(meta(h, "og:url")).toMatch(new RegExp(`/en/product/${PACK}$`));
    expect(meta(h, "og:image")).toMatch(/^https?:\/\/.+\.(png|jpe?g|webp|gif)$/); // demo pictures are SVG → the site icon
    expect(meta(h, "twitter:card")).toMatch(/^summary/);
    expect(meta(h, "og:site_name")).toBe(vi.metadata.siteName);
  });

  test("private pages stay out of search results", async ({ request }) => {
    for (const path of ["/vi/login", "/vi/cart", "/en/register"]) {
      expect(await head(request, path), path).toMatch(/<meta name="robots" content="noindex/);
    }
  });

  test("a store page does not carry the Admin texts to the browser (only what its components read)", async ({ request }) => {
    const html = await (await request.get("/vi/shop")).text();
    expect(html).toContain(vi.cart.added); // a client-side text of the store
    expect(html).not.toContain(vi.adminMedia.errors.badContent); // an Admin-only text
    expect(html).not.toContain(vi.adminUsers.listIntro);
  });
});
