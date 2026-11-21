import { describe, expect, it } from "vitest";
import {
  ADMIN_COUPON_SEARCH_MAX,
  COUPON_FIXED_MIN_VND,
  COUPON_USES_MAX,
  couponState,
  couponUsed,
  lockedChanges,
  parseAdminCouponFilters,
  parseCouponForm,
  parseShopDateTime,
  toShopDateTimeInput,
} from "@backend/lib/admin/coupon-rules";
import {
  EXTRA_COUNT_MAX,
  EXTRA_PRICE_MAX_VND,
  EXTRA_PRICE_MIN_VND,
  parseSettingsForm,
  parseWholeNumber,
} from "@backend/lib/admin/settings-rules";

/** Admin coupons + settings (GĐ5.6, DECISIONS #35). */
const form = {
  code: " tet2027 ",
  kind: "PERCENT",
  value: "15",
  minTotalVnd: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerUser: "",
  isActive: "on",
};

describe("parseShopDateTime / toShopDateTimeInput", () => {
  it("reads datetime-local values as Vietnam time (UTC+7) and writes them back the same", () => {
    expect(parseShopDateTime("2027-01-01T00:00")?.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    expect(toShopDateTimeInput(new Date("2026-12-31T17:00:00.000Z"))).toBe("2027-01-01T00:00");
    expect(parseShopDateTime("")).toBeNull();
    expect(toShopDateTimeInput(null)).toBe("");
    for (const bad of ["2027-02-30T10:00", "2027-01-01T24:00", "2027-01-01", "tomorrow"])
      expect(parseShopDateTime(bad)).toBeUndefined();
  });
});

describe("parseCouponForm", () => {
  it("normalises the code, defaults the optional fields, reads the checkbox", () => {
    expect(parseCouponForm(form)).toEqual({
      ok: true,
      value: {
        code: "TET2027",
        kind: "PERCENT",
        value: 15,
        minTotalVnd: 0,
        startsAt: null,
        endsAt: null,
        maxUses: null,
        maxUsesPerUser: null,
        isActive: true,
      },
    });
    expect(parseCouponForm({ ...form, isActive: "" })).toMatchObject({ ok: true, value: { isActive: false } });
    expect(
      parseCouponForm({
        ...form,
        kind: "FIXED",
        value: "50.000",
        minTotalVnd: "500,000",
        maxUses: "100",
        maxUsesPerUser: "1",
      }),
    ).toMatchObject({
      ok: true,
      value: { kind: "FIXED", value: 50_000, minTotalVnd: 500_000, maxUses: 100, maxUsesPerUser: 1 },
    });
  });

  it("refuses bad values field by field", () => {
    expect(parseCouponForm({ ...form, code: "", value: "" })).toEqual({
      ok: false,
      fields: { code: "required", value: "required" },
    });
    expect(parseCouponForm({ ...form, code: "a b" })).toMatchObject({ fields: { code: "codeFormat" } });
    expect(parseCouponForm({ ...form, value: "0" })).toMatchObject({ fields: { value: "percentRange" } });
    expect(parseCouponForm({ ...form, value: "101" })).toMatchObject({ fields: { value: "percentRange" } });
    expect(parseCouponForm({ ...form, value: "1.5" })).toMatchObject({ fields: { value: "notWhole" } }); // never 15%
    expect(parseCouponForm({ ...form, kind: "FIXED", value: String(COUPON_FIXED_MIN_VND - 1) })).toMatchObject({
      fields: { value: "fixedRange" },
    });
    expect(parseCouponForm({ ...form, maxUses: "0", maxUsesPerUser: String(COUPON_USES_MAX + 1) })).toMatchObject({
      fields: { maxUses: "outOfRange", maxUsesPerUser: "outOfRange" },
    });
    expect(parseCouponForm({ ...form, startsAt: "2027-02-01T00:00", endsAt: "2027-01-01T00:00" })).toMatchObject({
      fields: { endsAt: "endBeforeStart" },
    });
    expect(parseCouponForm({ ...form, startsAt: "2027-02-31T00:00" })).toMatchObject({
      fields: { startsAt: "badDate" },
    });
  });
});

describe("couponState / couponUsed / lockedChanges", () => {
  const now = new Date("2026-11-19T05:00:00Z");
  const c = { isActive: true, startsAt: null, endsAt: null, maxUses: null, usedCount: 0 };
  it("names what the Admin sees", () => {
    expect(couponState(c, now)).toBe("active");
    expect(couponState({ ...c, isActive: false, endsAt: new Date("2026-01-01") }, now)).toBe("inactive");
    expect(couponState({ ...c, endsAt: now }, now)).toBe("expired");
    expect(couponState({ ...c, startsAt: new Date("2026-12-01") }, now)).toBe("scheduled");
    expect(couponState({ ...c, maxUses: 3, usedCount: 3 }, now)).toBe("usedUp");
  });

  it("a coupon is used once an order carries it or a use was counted; then code / kind / value are locked", () => {
    expect(couponUsed({ usedCount: 0, orderCount: 0 })).toBe(false);
    expect(couponUsed({ usedCount: 0, orderCount: 1 })).toBe(true); // even a pending order
    expect(couponUsed({ usedCount: 1, orderCount: 0 })).toBe(true);
    const cur = { code: "TET", kind: "PERCENT" as const, value: 10 };
    expect(lockedChanges(cur, cur)).toEqual([]);
    expect(lockedChanges(cur, { code: "TET2", kind: "FIXED", value: 10 })).toEqual(["code", "kind"]);
    expect(lockedChanges(cur, { ...cur, value: 20 })).toEqual(["value"]);
  });
});

describe("parseAdminCouponFilters", () => {
  it("upper-cases and caps the search, keeps known states, clamps the page", () => {
    expect(parseAdminCouponFilters({})).toEqual({ q: "", state: undefined, page: 1 });
    expect(parseAdminCouponFilters({ q: " demo ", state: "expired", page: "3" })).toEqual({
      q: "DEMO",
      state: "expired",
      page: 3,
    });
    expect(parseAdminCouponFilters({ state: "usedUp", page: "-1" })).toEqual({ q: "", state: undefined, page: 1 });
    expect(parseAdminCouponFilters({ q: "x".repeat(99) }).q).toHaveLength(ADMIN_COUPON_SEARCH_MAX);
  });
});

describe("parseSettingsForm (more downloads offer)", () => {
  it("accepts whole numbers with thousands separators within the limits", () => {
    expect(parseWholeNumber(" 10.000 ", true)).toBe(10_000);
    expect(parseWholeNumber("10.000")).toBeNaN(); // not money: digits only
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("-5", true)).toBeNaN();
    expect(parseSettingsForm({ extraDownloadsCount: "3", extraDownloadsPriceVnd: "15.000" })).toEqual({
      ok: true,
      value: { count: 3, priceVnd: 15_000 },
    });
  });

  it("refuses 0 ₫, empty fields and values out of range", () => {
    expect(parseSettingsForm({ extraDownloadsCount: "", extraDownloadsPriceVnd: "0" })).toEqual({
      ok: false,
      fields: { extraDownloadsCount: "required", extraDownloadsPriceVnd: "outOfRange" },
    });
    expect(
      parseSettingsForm({
        extraDownloadsCount: String(EXTRA_COUNT_MAX + 1),
        extraDownloadsPriceVnd: String(EXTRA_PRICE_MAX_VND + 1),
      }),
    ).toMatchObject({ fields: { extraDownloadsCount: "outOfRange", extraDownloadsPriceVnd: "outOfRange" } });
    expect(
      parseSettingsForm({ extraDownloadsCount: "2", extraDownloadsPriceVnd: String(EXTRA_PRICE_MIN_VND - 1) }),
    ).toMatchObject({ fields: { extraDownloadsPriceVnd: "outOfRange" } });
    expect(parseSettingsForm({ extraDownloadsCount: "2,5", extraDownloadsPriceVnd: "10000" })).toMatchObject({
      fields: { extraDownloadsCount: "notWhole" }, // a count is never read as 25
    });
  });
});
