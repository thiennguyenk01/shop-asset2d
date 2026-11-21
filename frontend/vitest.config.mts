import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Frontend unit tests (navigation lists, scripts run before paint, texts sent to the browser, translation files).
 * Run from the repository root: npm test (PowerShell). Aliases: the same as tsconfig.json at the root.
 */
export default defineConfig({
  root: at("./"),
  resolve: { alias: { "@backend": at("../backend/src"), "@": at("./src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
