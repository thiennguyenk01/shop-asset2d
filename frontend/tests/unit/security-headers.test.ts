import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, PAGE_PATHS, SECURITY_HEADER_RULES } from "@/lib/http/security-headers";

/** GĐ7.2 — the headers next.config.ts adds (checked on real responses in frontend/tests/e2e/security.spec.ts). */
const pagePattern = new RegExp(`^${PAGE_PATHS}$`);

describe("security headers", () => {
  it("every path: nosniff, HSTS, no framing, no camera / microphone / location", () => {
    const all = SECURITY_HEADER_RULES.find((r) => r.source === "/:path*")!;
    const h = Object.fromEntries(all.headers.map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toMatch(/^max-age=\d{8}$/);
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    // These would compete with the stricter values the file routes set themselves.
    expect(Object.keys(h)).not.toContain("Content-Security-Policy");
    expect(Object.keys(h)).not.toContain("Referrer-Policy");
  });

  it("pages only: the CSP forbids framing, <base> hijacking and plugins", () => {
    expect(CONTENT_SECURITY_POLICY).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    const pages = SECURITY_HEADER_RULES.find((r) => r.source === PAGE_PATHS)!;
    expect(pages.headers.map((x) => x.key).sort()).toEqual(["Content-Security-Policy", "Referrer-Policy"]);
  });

  it("the page pattern skips API routes, the media route and Next assets", () => {
    for (const p of ["/vi/shop", "/en/product/tien-hiep-dao-mon", "/zh/login", "/vi/admin/products"]) expect(p).toMatch(pagePattern);
    for (const p of ["/api/files/abc", "/api/cron/reconcile", "/media/demo/x.svg", "/_next/static/chunk.js"]) expect(p).not.toMatch(pagePattern);
  });
});
