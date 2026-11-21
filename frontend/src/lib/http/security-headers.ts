/**
 * Response headers added to every page by next.config.ts (GĐ7.2 security review). Pure data, unit-tested.
 * Imported by next.config.ts with a relative path ("@/" does not resolve there).
 *
 * - Everywhere: no MIME sniffing, HTTPS only once a browser has seen the site over HTTPS (ignored on
 *   http://localhost), never inside a frame (clickjacking), no camera / microphone / location.
 * - Pages only: a Content-Security-Policy and a Referrer-Policy. The two routes that serve files (`/media/…`,
 *   `/api/files/…`) set stricter values of their own (sandbox, no-referrer), so these rules skip them rather than
 *   compete with them.
 *
 * The CSP limits what it can without breaking the site: no framing, no <base> hijack, no plugins. It does not
 * restrict script sources: a nonce-based policy would force every page to render per request (Next 16 docs,
 * "Content Security Policy": incompatible with Partial Prerendering / cached pages), and React already escapes
 * everything it renders (the one inline script, the theme bootstrap, is a fixed string).
 */
export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

export const CONTENT_SECURITY_POLICY = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

/** Every path the app serves (pages, API, files, Next assets). */
const EVERY_PATH = "/:path*";
/** Pages: everything except API routes, the media route and Next's own assets. */
export const PAGE_PATHS = "/((?!api/|media/|_next/).*)";

export const SECURITY_HEADER_RULES: HeaderRule[] = [
  {
    source: EVERY_PATH,
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Strict-Transport-Security", value: "max-age=63072000" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ],
  },
  {
    source: PAGE_PATHS,
    headers: [
      { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  },
];
