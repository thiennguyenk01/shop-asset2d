import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Integration tests (CLAUDE.md §7): the real services, repositories and transactions against the DEV database.
 * `backend/tests/integration/setup.ts` refuses to run against production (same guard as `db:*`).
 * Run: npm run test:integration (from PowerShell at the repository root, like the unit tests).
 */
export default defineConfig({
  root: at("./"),
  resolve: {
    alias: {
      "@backend": at("./src"),
      "@": at("../frontend/src"),
      "server-only": at("./tests/integration/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
