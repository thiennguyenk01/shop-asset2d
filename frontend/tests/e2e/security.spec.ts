import { expect, storageDriver, test } from "./fixtures";

/**
 * GĐ7.2 — security headers (frontend/src/lib/http/security-headers.ts, applied by next.config.ts).
 * Pages: no framing, a CSP, a referrer policy. File routes keep their own stricter values.
 */
test.describe("Security headers", () => {
  test("pages: never framed, CSP, nosniff, referrer policy, HSTS, no camera / microphone / location", async ({ request }) => {
    for (const path of ["/vi/shop", "/en/login", "/vi/product/tien-hiep-dao-mon"]) {
      const h = (await request.get(path)).headers();
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], path).toContain("object-src 'none'");
      expect(h["content-security-policy"], path).toContain("base-uri 'self'");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"], path).toMatch(/^max-age=\d+/);
      expect(h["permissions-policy"], path).toContain("camera=()");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("API answers carry the common headers too", async ({ request }) => {
    const h = (await request.get("/api/cron/reconcile")).headers(); // 404 without the secret
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  test("the media route keeps its own sandboxed CSP (not replaced by the page policy)", async ({ request }) => {
    test.skip(storageDriver() !== "local", "the /media route serves the local driver only (R2: npm run storage:check)");
    // A seeded demo image (`"/media/products/<slug>/<n>.svg"`); /_next/static/media/… (fonts) is something else.
    const html = await (await request.get("/vi/shop")).text();
    const media = /"(\/media\/products\/[a-z0-9][a-z0-9._/-]*\.svg)/.exec(html)?.[1];
    expect(media, "a /media/ image on the shop page").toBeTruthy();
    const res = await request.get(media!);
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("frame-ancestors");
  });
});
