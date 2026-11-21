import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_SEARCH_MAX,
  creditAfterRefund,
  parseAdminOrderFilters,
  parseRefundReason,
  REFUND_REASON_MAX,
  refundBlock,
} from "@backend/lib/admin/order-rules";

/** Admin orders + refunds (GĐ5.4, DECISIONS #33). */
describe("refundBlock", () => {
  it("only a paid order with money on it can be refunded", () => {
    expect(refundBlock({ status: "PAID", totalVnd: 150_000 })).toBeNull();
    for (const status of ["PENDING", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"] as const) {
      expect(refundBlock({ status, totalVnd: 150_000 })).toBe("notPaid");
    }
  });

  it("a 0 ₫ order (100 % coupon) has nothing to refund", () => {
    expect(refundBlock({ status: "PAID", totalVnd: 0 })).toBe("nothingToRefund");
  });
});

describe("parseRefundReason", () => {
  it("requires a reason, trims it, and caps its length", () => {
    expect(parseRefundReason("  Khách mua nhầm  ")).toEqual({ ok: true, reason: "Khách mua nhầm" });
    expect(parseRefundReason("")).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseRefundReason("   \n ")).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseRefundReason(null)).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseRefundReason(42)).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseRefundReason("a".repeat(REFUND_REASON_MAX))).toMatchObject({ ok: true });
    expect(parseRefundReason("a".repeat(REFUND_REASON_MAX + 1))).toEqual({ ok: false, error: "reasonTooLong" });
  });
});

describe("creditAfterRefund", () => {
  it("takes the bought downloads back in full, never below zero", () => {
    expect(creditAfterRefund(2, 2)).toBe(0);
    expect(creditAfterRefund(4, 2)).toBe(2); // two "more downloads" orders, one refunded
    expect(creditAfterRefund(1, 2)).toBe(0);
    expect(creditAfterRefund(0, 2)).toBe(0);
    expect(creditAfterRefund(3, -5)).toBe(3); // a bad count never adds downloads
  });
});

describe("parseAdminOrderFilters", () => {
  it("keeps known statuses, trims and caps the search, clamps the page", () => {
    expect(parseAdminOrderFilters({})).toEqual({ q: "", status: undefined, page: 1 });
    expect(parseAdminOrderFilters({ q: "  AG-2026  ", status: "PAID", page: "3" })).toEqual({
      q: "AG-2026",
      status: "PAID",
      page: 3,
    });
    expect(parseAdminOrderFilters({ status: "paid" }).status).toBeUndefined();
    expect(parseAdminOrderFilters({ status: "SHIPPED" }).status).toBeUndefined();
    for (const page of ["0", "-1", "abc", "1.5", "1e309"]) expect(parseAdminOrderFilters({ page }).page).toBe(1);
    expect(parseAdminOrderFilters({ q: "x".repeat(200) }).q).toHaveLength(ADMIN_ORDER_SEARCH_MAX);
  });
});
