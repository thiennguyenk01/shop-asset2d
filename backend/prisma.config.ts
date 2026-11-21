import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// The env files live at the repository root (one .env.local for the whole app); paths below are anchored to this
// folder so the CLI works whatever directory it runs from (`--config backend/prisma.config.ts` from the root).
const here = __dirname;
loadEnv({ path: [path.join(here, "..", ".env.local"), path.join(here, "..", ".env")], quiet: true });

/**
 * Prisma CLI config.
 * - CLI (migrate, introspect) uses DIRECT_URL — a direct, non-pooled Neon connection.
 * - The app at runtime uses DATABASE_URL (pooled) via the adapter in backend/src/db.ts.
 * Always run migrations/seed through the `db:*` npm scripts, which pass backend/scripts/db-guard.ts first.
 */
export default defineConfig({
  schema: path.join(here, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(here, "prisma", "migrations"),
    seed: `tsx ${path.join(here, "prisma", "seed", "index.ts").replace(/\\/g, "/")}`,
  },
  datasource: {
    // Optional so `prisma generate` works without database credentials (e.g. CI, first install).
    url: process.env.DIRECT_URL,
  },
});
