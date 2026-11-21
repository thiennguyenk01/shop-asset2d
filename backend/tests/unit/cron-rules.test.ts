import { describe, expect, it } from "vitest";
import {
  CRON_JOBS,
  expireBefore,
  guestCartCutoff,
  isCronAuthorized,
  isCronJob,
  orphanUploadCutoff,
} from "@backend/lib/cron/rules";

/** GĐ6.3 — scheduled jobs: when things count as overdue / stale, and who may start a job. */
describe("scheduled jobs", () => {
  const now = new Date("2026-11-20T12:00:00Z");

  it("orders expire 15 min after their expiry; guest carts after 30 days; uploads after 24 hours", () => {
    expect(expireBefore(now).toISOString()).toBe("2026-11-20T11:45:00.000Z");
    expect(guestCartCutoff(now).toISOString()).toBe("2026-10-21T12:00:00.000Z");
    expect(orphanUploadCutoff(now).toISOString()).toBe("2026-11-19T12:00:00.000Z");
  });

  it("only the two known jobs exist", () => {
    expect(CRON_JOBS).toEqual(["reconcile", "cleanup"]);
    expect(isCronJob("cleanup")).toBe(true);
    for (const j of ["", "Reconcile", "../cleanup", "seed"]) expect(isCronJob(j), j).toBe(false);
  });

  it("a job starts only with `Bearer <CRON_SECRET>`; no secret configured means nobody", () => {
    const secret = "s".repeat(40);
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isCronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isCronAuthorized(secret, secret)).toBe(false); // no "Bearer "
    expect(isCronAuthorized(`bearer ${secret}`, secret)).toBe(false);
    expect(isCronAuthorized(null, secret)).toBe(false);
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
