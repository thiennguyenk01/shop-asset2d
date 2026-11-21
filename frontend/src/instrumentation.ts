/**
 * Runs once when the server starts. See backend/src/startup-check.ts.
 * Node-only code is imported dynamically so the Edge compilation of this file stays clean.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeStartup } = await import("@backend/startup-check");
    assertSafeStartup();
  }
}
