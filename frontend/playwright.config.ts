import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Not a real secret: only the throw-away `next start` of the E2E run uses it (GĐ6.3 scheduled jobs). */
export const E2E_CRON_SECRET = "e2e-cron-secret-not-used-anywhere-else-000";
/**
 * Not a real Google client: it only makes the E2E server show "Continue with Google" (user choice 2026-11-26).
 * frontend/tests/e2e/google.spec.ts stops the browser at Google's door and checks what the site asked for.
 */
export const E2E_GOOGLE_CLIENT_ID = "e2e-not-a-real-client.apps.googleusercontent.com";

/**
 * E2E runs against a production build (`next build` + `next start`) on desktop and mobile.
 * Run `npm run build` first, then `npm run test:e2e` (both from the repository root).
 */
export default defineConfig({
  // The first uncached catalog queries hit Neon (free tier scales to zero), which can exceed the 5 s default.
  expect: { timeout: 10_000 },
  testDir: "tests/e2e",
  // Next to this config (frontend/test-results), not in the folder the command runs from.
  outputDir: "test-results",
  fullyParallel: true,
  // One `next start` + a free-tier Neon branch: more than 2 parallel browsers starves both and causes timeouts.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // From the repository root, like `npm start`: env files, .storage and .mail-outbox are resolved from there.
    command: `npx next start frontend -p ${PORT}`,
    cwd: path.join(__dirname, ".."),
    url: `http://localhost:${PORT}/vi`,
    reuseExistingServer: false,
    timeout: 120_000,
    // next start runs as production; Auth.js must trust localhost. CRON_SECRET: a test-only value for frontend/tests/e2e/cron.spec.ts.
    // AUTH_GOOGLE_*: a fake Google client so the Google button shows (google.spec.ts never reaches Google itself).
    env: {
      APP_ENV: "test",
      AUTH_TRUST_HOST: "true",
      CRON_SECRET: E2E_CRON_SECRET,
      AUTH_GOOGLE_ID: E2E_GOOGLE_CLIENT_ID,
      AUTH_GOOGLE_SECRET: "e2e-google-secret-not-real",
    },
  },
});
