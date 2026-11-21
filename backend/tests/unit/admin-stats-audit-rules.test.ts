import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  auditActionKey,
  auditTargetHref,
  parseAuditFilters,
  shopDayStart,
} from "@backend/lib/admin/audit-rules";
import {
  bucketKey,
  niceAxis,
  parseStatsRange,
  rangeBuckets,
  revenueSeries,
  seriesTotals,
} from "@backend/lib/admin/stats-rules";
import vi from "../../../frontend/messages/vi.json" with { type: "json" };

/** Admin statistics + action log (GĐ5.7, DECISIONS #36). */
describe("rangeBuckets (shop time, UTC+7)", () => {
  it("7 / 30 shop days ending today; the day turns at midnight Vietnam time", () => {
    const noon = new Date("2026-11-19T05:00:00Z"); // 12:00 in Vietnam
    const week = rangeBuckets("7d", noon);
    expect(week.granularity).toBe("day");
    expect(week.buckets.map((b) => b.key)).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
    expect(week.since.toISOString()).toBe("2026-11-12T17:00:00.000Z");
    expect(rangeBuckets("30d", noon).buckets).toHaveLength(30);
    // 01:00 on the 20th in Vietnam is still the 19th in UTC: the last bucket is already the 20th.
    expect(rangeBuckets("7d", new Date("2026-11-19T18:00:00Z")).buckets.at(-1)!.key).toBe("2026-11-20");
    expect(bucketKey(new Date("2026-11-19T16:59:59Z"), "day")).toBe("2026-11-19");
    expect(bucketKey(new Date("2026-11-19T17:00:00Z"), "day")).toBe("2026-11-20");
  });

  it("12 shop months ending this month", () => {
    const r = rangeBuckets("12m", new Date("2026-11-19T05:00:00Z"));
    expect(r.granularity).toBe("month");
    expect(r.buckets.map((b) => b.key)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(r.since.toISOString()).toBe("2025-11-30T17:00:00.000Z");
    expect(parseStatsRange("12m")).toBe("12m");
    for (const bad of [undefined, "", "1y", "30D"]) expect(parseStatsRange(bad)).toBe("30d");
  });
});

describe("revenueSeries / seriesTotals / niceAxis", () => {
  it("fills empty periods with 0 and never adds Demo money to real money", () => {
    const { buckets } = rangeBuckets("7d", new Date("2026-11-19T05:00:00Z"));
    const series = revenueSeries(buckets, [
      { bucket: "2026-11-19", isDemo: false, totalVnd: 1_290_000, orders: 1 },
      { bucket: "2026-11-19", isDemo: true, totalVnd: 952_000, orders: 1 },
      { bucket: "2026-11-15", isDemo: true, totalVnd: 500_000, orders: 2 },
      { bucket: "2026-10-01", isDemo: false, totalVnd: 9_999_999, orders: 9 }, // outside the range
    ]);
    expect(series).toHaveLength(7);
    expect(series.at(-1)).toMatchObject({ realVnd: 1_290_000, demoVnd: 952_000, realOrders: 1, demoOrders: 1 });
    expect(series.find((p) => p.key === "2026-11-16")).toMatchObject({ realVnd: 0, demoVnd: 0 });
    expect(seriesTotals(series)).toEqual({ realVnd: 1_290_000, demoVnd: 1_452_000, realOrders: 1, demoOrders: 3 });
  });

  it("round gridlines that reach the largest value", () => {
    expect(niceAxis(0)).toEqual([0]);
    expect(niceAxis(1_290_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(niceAxis(100_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    for (const max of [1, 7, 99, 12_345, 987_654_321]) expect(niceAxis(max).at(-1)!).toBeGreaterThanOrEqual(max);
  });
});

describe("Action log rules", () => {
  it("every action written by the Admin area is listed (and translated); nothing listed is unused", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(join(process.cwd(), "backend/src/modules"));
    const found = new Set<string>();
    for (const f of files)
      for (const m of readFileSync(f, "utf8").matchAll(/"((?:product|order|user|coupon|settings|transfer)\.[a-zA-Z.]+)"/g))
        found.add(m[1]);
    // product.publish / hide / draft are built as `product.${…}` in setStatusRows.
    for (const dynamic of ["product.publish", "product.hide", "product.draft"]) found.add(dynamic);
    expect([...found].sort()).toEqual([...AUDIT_ACTIONS].sort());
    for (const a of AUDIT_ACTIONS) expect(vi.adminAudit.action[auditActionKey(a)]).toBeTruthy();
  });

  it("reads filters from the URL: unknown values are ignored, days are shop days, reversed days are swapped", () => {
    expect(parseAuditFilters({})).toMatchObject({
      adminId: undefined,
      action: undefined,
      since: undefined,
      until: undefined,
      page: 1,
    });
    const f = parseAuditFilters({
      admin: "cmwnj90yw005ofcnh9vbv14pf",
      action: "user.lock",
      from: "2026-11-01",
      to: "2026-11-19",
      page: "2",
    });
    expect(f).toMatchObject({
      adminId: "cmwnj90yw005ofcnh9vbv14pf",
      action: "user.lock",
      from: "2026-11-01",
      to: "2026-11-19",
      page: 2,
    });
    expect(f.since!.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(f.until!.toISOString()).toBe("2026-11-19T17:00:00.000Z"); // "to" includes the whole day
    expect(parseAuditFilters({ admin: "../x", action: "user.delete", from: "2026-02-30", page: "-1" })).toMatchObject({
      adminId: undefined,
      action: undefined,
      from: undefined,
      since: undefined,
      page: 1,
    });
    const swapped = parseAuditFilters({ from: "2026-11-19", to: "2026-11-01" });
    expect([swapped.from, swapped.to]).toEqual(["2026-11-01", "2026-11-19"]);
    expect(swapped.since!.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(swapped.until!.toISOString()).toBe("2026-11-19T17:00:00.000Z");
    expect(shopDayStart("2026-11-19")!.toISOString()).toBe("2026-11-18T17:00:00.000Z");
  });

  it("links each row to where the thing lives; deleted things have no link", () => {
    expect(auditTargetHref({ action: "product.update", entity: "Product", entityId: "p1" })).toBe("/admin/products/p1");
    expect(auditTargetHref({ action: "product.delete", entity: "Product", entityId: "p1" })).toBeNull();
    expect(auditTargetHref({ action: "user.lock", entity: "User", entityId: "u1" })).toBe("/admin/users/u1");
    expect(auditTargetHref({ action: "coupon.update", entity: "Coupon", entityId: "c1" })).toBe("/admin/coupons/c1");
    expect(auditTargetHref({ action: "coupon.delete", entity: "Coupon", entityId: "c1" })).toBeNull();
    expect(auditTargetHref({ action: "settings.update", entity: "ShopSettings", entityId: "1" })).toBe(
      "/admin/settings",
    );
    expect(auditTargetHref({ action: "order.refund", entity: "Order", entityId: "o1" })).toBeNull(); // linked by code
  });
});
