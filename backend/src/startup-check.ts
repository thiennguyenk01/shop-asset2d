import { getEnv } from "./env";

/**
 * An unsafe configuration (e.g. Demo Payment in production) must stop the process instead
 * of serving requests (CLAUDE.md §6). Without the explicit exit, Next.js keeps the process
 * alive and answers every request with 500. Vercel production builds are additionally
 * blocked in next.config.ts.
 */
export function assertSafeStartup(): void {
  try {
    getEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
