"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@backend/auth/guards";
import { CATALOG_TAG } from "@backend/modules/product/queries";
import { createManualOrder, refundAdminOrder } from "./admin-service";

/**
 * Admin order actions (GĐ5.4) — thin: Admin check on every call (CLAUDE.md, `.claude/rules/admin.md`), then the
 * service. A refund changes sales counts (the shop's "best selling" order), so the catalog cache is refreshed.
 */
export type RefundFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminOrders.errors. */
  error?: string;
  /** The typed reason, to refill the form after an error. */
  values?: { reason: string };
  savedAt?: number;
};

async function adminOrNull() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

export async function refundOrderAction(
  code: string,
  _prev: RefundFormState,
  form: FormData,
): Promise<RefundFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const raw = form.get("reason");
  const reason = typeof raw === "string" ? raw : "";
  const result = await refundAdminOrder(code, reason, admin.id);
  if (!result.ok) {
    if (result.error === "notPaid") refresh(); // someone else refunded it meanwhile: show the current state
    return { status: "error", error: result.error, values: { reason } };
  }
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", savedAt: Date.now() };
}

export type ManualOrderFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminUsers.manual.errors. */
  error?: string;
  /** What was typed / picked, to refill the form after an error. */
  values?: { productIds: string[]; amount: string; note: string; transferId: string };
  /** The new order (success). */
  code?: string;
  savedAt?: number;
};

/**
 * Record an order by hand for a customer who paid by a private transfer (user choice 2026-11-21). Changes sales
 * counts (the shop's "best selling" order), so the catalog cache is refreshed.
 */
export async function createManualOrderAction(userId: string, _prev: ManualOrderFormState, form: FormData): Promise<ManualOrderFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const values = {
    productIds: form.getAll("productId").filter((v): v is string => typeof v === "string"),
    amount: text("amount"),
    note: text("note"),
    transferId: text("transferId"),
  };
  const result = await createManualOrder(userId, { ...values, productIds: values.productIds, transferId: values.transferId || null }, admin.id);
  if (!result.ok) {
    if (result.error === "alreadyOwned" || result.error === "packUnavailable" || result.error === "transferUnavailable") refresh();
    return { status: "error", error: result.error, values };
  }
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", code: result.code, savedAt: Date.now() };
}
