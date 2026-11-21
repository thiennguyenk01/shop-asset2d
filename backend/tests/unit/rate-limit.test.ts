import { describe, expect, it } from "vitest";
import {
  clientIp,
  couponSubjects,
  isLimited,
  loginSubjects,
  passwordChangeSubjects,
  RATE_LIMITS,
  rateKey,
  rateLimitCutoff,
  registerSubjects,
  resetRequestSubjects,
  retryAfterMinutes,
} from "@backend/lib/rate-limit/rules";

/** Failed-attempt limits (GĐ7.1): keys, windows, waiting time, client IP. */
const now = new Date("2026-11-20T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const h = (values: Record<string, string>) => ({ get: (n: string) => values[n] ?? null });

describe("keys", () => {
  it("hash the subject: no raw email or IP is stored; case and spaces do not matter", () => {
    const key = rateKey({ scope: "loginEmail", subject: "Lam.Phong@Example.test" });
    expect(key).toMatch(/^loginEmail:[0-9a-f]{64}$/);
    expect(key).not.toContain("example");
    expect(rateKey({ scope: "loginEmail", subject: "  lam.phong@example.test " })).toBe(key);
    expect(rateKey({ scope: "loginIp", subject: "lam.phong@example.test" })).not.toBe(key); // scopes never share a counter
  });

  it("sign-in counts per email and per IP; coupons per shopper (when known) and per IP", () => {
    expect(loginSubjects("a@b.test", "1.2.3.4").map((s) => s.scope)).toEqual(["loginEmail", "loginIp"]);
    expect(couponSubjects("user:abc", "1.2.3.4").map((s) => s.scope)).toEqual(["couponShopper", "couponIp"]);
    expect(couponSubjects(null, "1.2.3.4").map((s) => s.scope)).toEqual(["couponIp"]);
  });

  it("GĐ7.2: sign-ups and reset requests per IP (10 an hour); password changes per account (10 in 15 minutes)", () => {
    expect(registerSubjects("1.2.3.4")).toEqual([{ scope: "registerIp", subject: "1.2.3.4" }]);
    expect(resetRequestSubjects("1.2.3.4")).toEqual([{ scope: "resetRequestIp", subject: "1.2.3.4" }]);
    expect(passwordChangeSubjects("abc")).toEqual([{ scope: "passwordChange", subject: "user:abc" }]);
    expect(RATE_LIMITS.registerIp).toEqual({ max: 10, windowMinutes: 60 });
    expect(RATE_LIMITS.resetRequestIp).toEqual({ max: 10, windowMinutes: 60 });
    expect(RATE_LIMITS.passwordChange).toEqual({ max: 10, windowMinutes: 15 });
    // The same IP never shares a counter between sign-in, sign-up and reset requests.
    const keys = (["loginIp", "registerIp", "resetRequestIp"] as const).map((scope) => rateKey({ scope, subject: "1.2.3.4" }));
    expect(new Set(keys).size).toBe(3);
  });
});

describe("windows", () => {
  const { max, windowMinutes } = RATE_LIMITS.loginEmail;
  it(`refuses from ${max} failures inside ${windowMinutes} minutes, and again after the window`, () => {
    expect(isLimited("loginEmail", null, now)).toBe(false);
    expect(isLimited("loginEmail", { count: max - 1, windowStart: minutesAgo(1) }, now)).toBe(false);
    expect(isLimited("loginEmail", { count: max, windowStart: minutesAgo(1) }, now)).toBe(true);
    expect(isLimited("loginEmail", { count: max + 5, windowStart: minutesAgo(windowMinutes - 1) }, now)).toBe(true);
    expect(isLimited("loginEmail", { count: max + 5, windowStart: minutesAgo(windowMinutes) }, now)).toBe(false);
  });

  it("says how many whole minutes are left (at least 1)", () => {
    expect(retryAfterMinutes("loginEmail", { count: max, windowStart: minutesAgo(1) }, now)).toBe(windowMinutes - 1);
    expect(retryAfterMinutes("loginEmail", { count: max, windowStart: new Date(minutesAgo(windowMinutes).getTime() + 5_000) }, now)).toBe(1);
    expect(retryAfterMinutes("couponIp", { count: 99, windowStart: minutesAgo(0) }, now)).toBe(RATE_LIMITS.couponIp.windowMinutes);
  });

  it("old rows are removed after a day, longer than every window", () => {
    expect(rateLimitCutoff(now).toISOString()).toBe("2026-11-19T10:00:00.000Z");
    for (const { windowMinutes: w } of Object.values(RATE_LIMITS)) expect(w).toBeLessThan(24 * 60);
  });
});

describe("client IP", () => {
  it("takes the IP the hosting proxy reports", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("anything else shares one 'unknown' counter", () => {
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientIp(h({ "x-real-ip": "not an ip; drop table" }))).toBe("unknown");
  });
});
