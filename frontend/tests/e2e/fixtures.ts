import { loadEnvConfig } from "@next/env";
import { test as base, type BrowserContext } from "@playwright/test";

export { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * Every E2E spec imports `test` from here (GĐ7.2). Each test gets its own made-up client IP, sent as the
 * proxy header the app reads (`x-real-ip`, lib/rate-limit/rules.ts), so the per-IP limits (failed sign-ins and
 * coupons GĐ7.1; sign-ups and "forgot password" requests GĐ7.2) never carry over between tests or runs.
 * It is a context option, so it also applies to `request` and to contexts a test opens itself
 * (`browser.newContext()`, e.g. a second device or an Admin window).
 */
const octet = () => Math.floor(Math.random() * 250) + 1;
export const randomClientIp = () => `10.${octet()}.${octet()}.${octet()}`;

/** A "try again in {minutes}" message with any number of minutes, as an exact-match RegExp. */
export const withAnyMinutes = (template: string) =>
  new RegExp(`^${template.split("{minutes}").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\d+")}$`);

/**
 * The storage driver of .env.local (GĐ7.5). Tests of the local driver's `/media/…` route skip with "r2": that route
 * then always 404s (pictures come from R2_PUBLIC_BASE_URL) and `npm run storage:check` checks the R2 side.
 */
export function storageDriver(): string {
  loadEnvConfig(process.cwd());
  return process.env.STORAGE_DRIVER ?? "local";
}

/**
 * With STORAGE_DRIVER=r2 (GĐ7.5) the Admin's browser PUTs uploads straight to R2. The made-up `x-real-ip` above is
 * sent with EVERY request of the context, so that cross-origin PUT would ask R2's CORS preflight for a header no
 * real browser sends (and the bucket's AllowedHeaders rightly refuses). Specs that upload call this: R2 requests
 * are routed and the header removed. While a route is active Playwright answers CORS preflights itself, so the
 * bucket's real CORS policy is checked by `npm run storage:check`, not here. With the local driver nothing matches.
 */
export async function sendUploadsWithoutTestIp(context: BrowserContext) {
  await context.route(/\.r2\.cloudflarestorage\.com\//, (route) => {
    const headers = { ...route.request().headers() };
    delete headers["x-real-ip"];
    return route.continue({ headers });
  });
}

export const test = base.extend({
  // (`provide` is Playwright's `use`, renamed so the React hooks lint rule does not mistake it for a hook.)
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    await provide({ ...extraHTTPHeaders, "x-real-ip": randomClientIp() });
  },
});
