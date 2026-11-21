import { describe, expect, it } from "vitest";
import { orderMoneySummary } from "@backend/lib/admin/order-rules";
import { parseTransferFilters, parseTransferNote, TRANSFER_NOTE_MAX } from "@backend/lib/admin/transfer-rules";
import {
  formatAmountInput,
  MANUAL_NOTE_MAX,
  MANUAL_ORDER_MAX_PACKS,
  manualOrderAmounts,
  parseManualOrderForm,
} from "@backend/lib/admin/manual-order-rules";
import { auditTargetHref, isAuditAction } from "@backend/lib/admin/audit-rules";

describe("order money summary (Admin orders page, user request 2026-11-21)", () => {
  const groups = [
    { status: "PAID" as const, isDemo: false, orders: 3, totalVnd: 3_000_000, discountVnd: 200_000 },
    { status: "REFUNDED" as const, isDemo: false, orders: 1, totalVnd: 500_000, discountVnd: 0 },
    { status: "PENDING" as const, isDemo: false, orders: 4, totalVnd: 800_000, discountVnd: 0 },
    { status: "EXPIRED" as const, isDemo: false, orders: 1, totalVnd: 100_000, discountVnd: 0 },
    { status: "FAILED" as const, isDemo: false, orders: 1, totalVnd: 50_000, discountVnd: 0 },
    { status: "CANCELLED" as const, isDemo: false, orders: 1, totalVnd: 70_000, discountVnd: 0 },
    { status: "PAID" as const, isDemo: true, orders: 2, totalVnd: 1_680_000, discountVnd: 10_000 },
  ];

  it("splits real money by status and keeps Demo money apart", () => {
    const { real, demo } = orderMoneySummary(groups);
    expect(real.paid).toEqual({ orders: 3, totalVnd: 3_000_000 });
    expect(real.refunded).toEqual({ orders: 1, totalVnd: 500_000 });
    expect(real.pending).toEqual({ orders: 4, totalVnd: 800_000 });
    expect(real.unpaid).toEqual({ orders: 3, totalVnd: 220_000 });
    expect(real.all).toEqual({ orders: 11, totalVnd: 4_520_000 });
    expect(real.discountVnd).toBe(200_000); // discounts of PAID orders only
    expect(real.averagePaidVnd).toBe(1_000_000);
    expect(demo.paid).toEqual({ orders: 2, totalVnd: 1_680_000 });
    expect(demo.all.orders).toBe(2);
  });

  it("PENDING orders past their expiry count as not collected, like the list", () => {
    const { real } = orderMoneySummary(groups, [{ isDemo: false, orders: 3, totalVnd: 600_000, discountVnd: 0 }]);
    expect(real.pending).toEqual({ orders: 1, totalVnd: 200_000 });
    expect(real.unpaid).toEqual({ orders: 6, totalVnd: 820_000 });
    expect(real.all).toEqual({ orders: 11, totalVnd: 4_520_000 }); // moving between tiles changes no total
  });

  it("no orders → zeros, and no division by zero", () => {
    const { real, demo } = orderMoneySummary([]);
    expect(real.averagePaidVnd).toBe(0);
    expect(real.all).toEqual({ orders: 0, totalVnd: 0 });
    expect(demo.paid).toEqual({ orders: 0, totalVnd: 0 });
  });

  it("the average is rounded to a whole đồng", () => {
    const { real } = orderMoneySummary([{ status: "PAID", isDemo: false, orders: 3, totalVnd: 100_000, discountVnd: 0 }]);
    expect(real.averagePaidVnd).toBe(33_333);
  });
});

describe("unmatched transfers (DECISIONS #45)", () => {
  it("list filter: waiting ones by default; unknown values are ignored", () => {
    expect(parseTransferFilters({})).toEqual({ state: "open", page: 1 });
    expect(parseTransferFilters({ state: "resolved", page: "3" })).toEqual({ state: "resolved", page: 3 });
    expect(parseTransferFilters({ state: "deleted", page: "-2" })).toEqual({ state: "open", page: 1 });
    expect(parseTransferFilters({ state: "all", page: "abc" })).toEqual({ state: "all", page: 1 });
  });

  it("the note on how it was handled is required, trimmed, and limited", () => {
    expect(parseTransferNote("  Đã hoàn tiền cho khách  ")).toEqual({ ok: true, note: "Đã hoàn tiền cho khách" });
    expect(parseTransferNote("   ")).toEqual({ ok: false, error: "noteRequired" });
    expect(parseTransferNote(undefined)).toEqual({ ok: false, error: "noteRequired" });
    expect(parseTransferNote("x".repeat(TRANSFER_NOTE_MAX))).toMatchObject({ ok: true });
    expect(parseTransferNote("x".repeat(TRANSFER_NOTE_MAX + 1))).toEqual({ ok: false, error: "noteTooLong" });
  });

  it("marking one handled is an audited action that links back to the list", () => {
    expect(isAuditAction("transfer.resolve")).toBe(true);
    expect(auditTargetHref({ action: "transfer.resolve", entity: "UnmatchedTransfer", entityId: "abc" })).toBe("/admin/orders/transfers?state=all");
  });
});

describe("manual orders (user choice 2026-11-21: private transfer → order by hand)", () => {
  const id = (n: number) => `cmpack${String(n).padStart(8, "0")}`;
  const form = (over: Partial<{ productIds: unknown[]; amount: unknown; note: unknown; transferId: unknown }> = {}) => ({
    productIds: [id(1)],
    amount: "150000",
    note: "Chuyển khoản MB ngày 21/11",
    transferId: "",
    ...over,
  });

  it("parses the form: ids deduplicated, amount written with dots or spaces, a bad transfer id ignored", () => {
    expect(parseManualOrderForm(form({ productIds: [id(1), id(1), id(2)], amount: "1.680.000 ₫", transferId: "x" }))).toEqual({
      ok: true,
      input: { productIds: [id(1), id(2)], amountVnd: 1_680_000, note: "Chuyển khoản MB ngày 21/11", transferId: null },
    });
    expect(parseManualOrderForm(form({ transferId: "cmtransfer000001" }))).toMatchObject({ ok: true, input: { transferId: "cmtransfer000001" } });
  });

  it("refuses no pack, too many packs, a bad amount, and a missing or long note", () => {
    expect(parseManualOrderForm(form({ productIds: [] }))).toEqual({ ok: false, error: "pickPack" });
    expect(parseManualOrderForm(form({ productIds: ["../etc"] }))).toEqual({ ok: false, error: "pickPack" });
    expect(parseManualOrderForm(form({ productIds: Array.from({ length: MANUAL_ORDER_MAX_PACKS + 1 }, (_, i) => id(i)) }))).toEqual({
      ok: false,
      error: "tooManyPacks",
    });
    for (const amount of ["", "0", "-5", "12abc", "1.5e3", undefined]) {
      expect(parseManualOrderForm(form({ amount })), String(amount)).toEqual({ ok: false, error: "amountInvalid" });
    }
    expect(parseManualOrderForm(form({ note: "  " }))).toEqual({ ok: false, error: "noteRequired" });
    expect(parseManualOrderForm(form({ note: "x".repeat(MANUAL_NOTE_MAX + 1) }))).toEqual({ ok: false, error: "noteTooLong" });
  });

  it("amounts: the list price is the subtotal, any shortfall a discount; never above the list price", () => {
    expect(manualOrderAmounts([150_000, 80_000], 230_000)).toEqual({ ok: true, subtotalVnd: 230_000, discountVnd: 0, totalVnd: 230_000 });
    expect(manualOrderAmounts([150_000, 80_000], 200_000)).toEqual({ ok: true, subtotalVnd: 230_000, discountVnd: 30_000, totalVnd: 200_000 });
    expect(manualOrderAmounts([150_000], 150_001)).toEqual({ ok: false, error: "amountTooHigh" });
  });

  it("is an audited action", () => {
    expect(isAuditAction("order.manual")).toBe(true);
  });

  it("groups the amount as typed (3970000 → 3.970.000 in Vietnamese), digits only, and the parser reads it back", () => {
    expect(formatAmountInput("3970000", "vi")).toBe("3.970.000");
    expect(formatAmountInput("3.970.0001", "vi")).toBe("39.700.001");
    expect(formatAmountInput("3970000", "en")).toBe("3,970,000");
    expect(formatAmountInput("3970000", "zh")).toBe("3,970,000");
    expect(formatAmountInput("00012a", "vi")).toBe("12");
    expect(formatAmountInput("", "vi")).toBe("");
    expect(formatAmountInput("abc", "vi")).toBe("");
    expect(formatAmountInput("9".repeat(15), "vi")).toBe("999.999.999.999");
    for (const locale of ["vi", "en", "zh"]) {
      const r = parseManualOrderForm({ productIds: ["ckpack00000000000001"], amount: formatAmountInput("3970000", locale), note: "x", transferId: "" });
      expect(r.ok && r.input.amountVnd).toBe(3_970_000);
    }
  });
});
