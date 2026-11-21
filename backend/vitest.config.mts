import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Backend unit tests (pure rules, services with fakes). Run from the repository root: npm test (PowerShell).
 * Aliases: the same as tsconfig.json at the root.
 */
export default defineConfig({
  root: at("./"),
  resolve: { alias: { "@backend": at("./src"), "@": at("../frontend/src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
