/**
 * This site's public origin, for links a payment gateway sends the buyer back to and for its notifications
 * (step 6.4). Deployed (preview / production): always APP_URL. In development the origin the browser used
 * (e.g. a Cloudflare quick tunnel, so MoMo can reach the site — user choice 2026-11-20), falling back to APP_URL.
 * Pure (unit-tested); headers come from the request.
 */
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function publicOrigin(input: { headers: { get(name: string): string | null }; appUrl: string; deployed: boolean }): string {
  const fallback = new URL(input.appUrl).origin;
  if (input.deployed) return fallback;
  const host = (input.headers.get("x-forwarded-host") ?? input.headers.get("host") ?? "").split(",")[0].trim();
  const proto = (input.headers.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  if (!HOST_RE.test(host) || (proto !== "http" && proto !== "https")) return fallback;
  return `${proto}://${host.toLowerCase()}`;
}
