import { expect, test } from "./fixtures";
import { E2E_CRON_SECRET } from "../../playwright.config";

/**
 * GĐ6.3 — scheduled jobs over HTTP. Only `Authorization: Bearer <CRON_SECRET>` starts a job; anything else gets
 * the same 404 as an unknown path. The E2E server runs with a test-only CRON_SECRET (playwright.config.ts).
 */
test.describe("Scheduled jobs (/api/cron/*)", () => {
  test("refuse callers without the secret, and unknown jobs", async ({ request }) => {
    const attempts: Record<string, string>[] = [{}, { authorization: "Bearer sai-khoa" }, { authorization: E2E_CRON_SECRET }];
    for (const headers of attempts) {
      const r = await request.get("/api/cron/reconcile", { headers });
      expect(r.status()).toBe(404);
      expect(r.headers()["cache-control"]).toContain("no-store");
    }
    const unknown = await request.get("/api/cron/seed", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(unknown.status()).toBe(404);
    // POST is not a way in either.
    expect(
      (await request.post("/api/cron/cleanup", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).status(),
    ).toBe(405);
  });

  test("with the secret, each job runs and reports what it did", async ({ request }) => {
    const auth = { authorization: `Bearer ${E2E_CRON_SECRET}` };
    const reconcile = await request.get("/api/cron/reconcile", { headers: auth });
    expect(reconcile.status()).toBe(200);
    expect(await reconcile.json()).toEqual({ job: "reconcile", expiredOrders: expect.any(Number), waitingOrders: expect.any(Number) });
    const cleanup = await request.get("/api/cron/cleanup", { headers: auth });
    expect(cleanup.status()).toBe(200);
    expect(await cleanup.json()).toEqual({
      job: "cleanup",
      guestCarts: expect.any(Number),
      orphanUploads: expect.any(Number),
      rateLimits: expect.any(Number),
    });
  });
});
