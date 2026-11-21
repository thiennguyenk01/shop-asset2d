import { afterAll, describe, expect, it } from "vitest";
import { RATE_LIMITS, rateKey, type RateSubject } from "@backend/lib/rate-limit/rules";
import { deleteRateRowsBefore } from "@backend/modules/rate-limit/repository";
import { checkRateLimit, clearRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { db, newTag } from "./fixtures";

/** Failed-attempt counters (GĐ7.1) in the dev database: atomic counting, windows, clearing, cleanup. */
const tag = newTag();
const subject = (name: string, scope: RateSubject["scope"] = "loginEmail"): RateSubject => ({ scope, subject: `it-${tag}-${name}@example.test` });
const used: RateSubject[] = [];
const track = (s: RateSubject) => (used.push(s), s);

afterAll(async () => {
  await db().rateLimit.deleteMany({ where: { key: { in: used.map(rateKey) } } });
  expect(await db().rateLimit.count({ where: { key: { in: used.map(rateKey) } } })).toBe(0);
});

describe("rate limit counters", () => {
  it("counts concurrent failures exactly and refuses at the limit, with the minutes left", async () => {
    const s = track(subject("burst"));
    const { max, windowMinutes } = RATE_LIMITS.loginEmail;
    const now = new Date();
    await Promise.all(Array.from({ length: max - 1 }, () => recordFailure([s], now)));
    const row = await db().rateLimit.findUniqueOrThrow({ where: { key: rateKey(s) } });
    expect(row.count).toBe(max - 1);
    expect(await checkRateLimit([s], now)).toEqual({ limited: false });

    await recordFailure([s], now);
    expect(await checkRateLimit([s], now)).toEqual({ limited: true, retryAfterMinutes: windowMinutes });
    // Any limited subject limits the whole check (e.g. the IP while the email is fine).
    expect((await checkRateLimit([track(subject("fresh")), s], now)).limited).toBe(true);
  });

  it("a failure after the window starts a new window at 1", async () => {
    const s = track(subject("window"));
    const { max, windowMinutes } = RATE_LIMITS.loginEmail;
    const long = new Date(Date.now() - (windowMinutes + 1) * 60_000);
    for (let i = 0; i < max; i++) await recordFailure([s], long);
    expect((await checkRateLimit([s])).limited).toBe(false); // that window is over
    await recordFailure([s]);
    const row = await db().rateLimit.findUniqueOrThrow({ where: { key: rateKey(s) } });
    expect(row.count).toBe(1);
    expect(row.windowStart.getTime()).toBeGreaterThan(long.getTime());
  });

  it("clearing removes the counter (successful sign-in); the cleanup job removes rows older than a day", async () => {
    const s = track(subject("clear"));
    for (let i = 0; i < RATE_LIMITS.loginEmail.max; i++) await recordFailure([s]);
    await clearRateLimit(s);
    expect(await checkRateLimit([s])).toEqual({ limited: false });

    const old = track(subject("old", "couponIp"));
    await recordFailure([old], new Date(Date.now() - 25 * 3_600_000));
    expect(await deleteRateRowsBefore(new Date(Date.now() - 24 * 3_600_000))).toBeGreaterThanOrEqual(1);
    expect(await db().rateLimit.count({ where: { key: rateKey(old) } })).toBe(0);
  });
});
