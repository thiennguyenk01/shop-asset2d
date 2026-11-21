import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Next.js app lives in frontend/ (backend/ holds the server code it imports).
  { settings: { next: { rootDir: "frontend/" } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "frontend/next-env.d.ts",
    // Generated / local-only output
    "backend/src/generated/**",
    ".storage/**",
    ".mail-outbox/**",
    ".backup/**",
    "frontend/playwright-report/**",
    "frontend/test-results/**",
  ]),
]);

export default eslintConfig;
