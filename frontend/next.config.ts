import path from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import type * as Env from "../backend/src/env";
import type * as SecurityHeaders from "./src/lib/http/security-headers";

/** The repository root: frontend/ (this app) and backend/ (server code, Prisma, scripts) sit side by side in it. */
const REPO_ROOT = path.join(__dirname, "..");

/**
 * Next compiles this file with relative imports resolved from the folder the command runs in (the repository root),
 * not from this file: the project's own modules are therefore loaded by absolute path.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = <T,>(fromRoot: string): T => require(path.join(REPO_ROOT, fromRoot)) as T;
const { SECURITY_HEADER_RULES } = load<typeof SecurityHeaders>("frontend/src/lib/http/security-headers.ts");

// One set of env files for the whole repository, at its root (.env.local, .env): Next itself only reads the app's
// own folder (empty) and remembers that first load, so the root is loaded again (forceReload) and recorded as part of
// the initial env, which Next restores in its workers. Values already set (shell, Vercel) win, as with Next's loading.
const { parsedEnv } = loadEnvConfig(REPO_ROOT, process.env.NODE_ENV !== "production", undefined, true);
if (parsedEnv) updateInitialEnv(parsedEnv);

// Vercel production deployments fail at build time if the configuration is unsafe
// (Demo Payment, local storage, missing secrets) — so they can never go live.
if (process.env.VERCEL_ENV === "production") load<typeof Env>("backend/src/env.ts").parseEnv(process.env);

// Relative to the folder the command runs from (the repository root: `next dev frontend`); next-intl needs a relative
// path for Turbopack.
const withNextIntl = createNextIntlPlugin("./frontend/src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // No home page: the store (shop) is the start page (CLAUDE.md §13, 2026-11-14).
  async redirects() {
    return [{ source: "/:locale(vi|en|zh)", destination: "/:locale/shop", permanent: false }];
  },
  // Security headers (GĐ7.2): see frontend/src/lib/http/security-headers.ts.
  async headers() {
    return SECURITY_HEADER_RULES;
  },
  // Native argon2 binding must not be bundled.
  serverExternalPackages: ["@node-rs/argon2"],
  // The app imports the backend from ../backend: both the bundler and the output tracing work from the repository root.
  outputFileTracingRoot: REPO_ROOT,
  turbopack: {
    // Pinned (not detected): a stray package-lock.json in the user's home folder would otherwise confuse detection.
    root: REPO_ROOT,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const config = withNextIntl(nextConfig);
// next-intl checks the path above from the folder the command runs in, but Turbopack resolves aliases from this app
// folder: point its alias at the same file, relative to frontend/.
config.turbopack = { ...config.turbopack, resolveAlias: { ...config.turbopack?.resolveAlias, "next-intl/config": "./src/i18n/request.ts" } };

export default config;
