import "server-only";
import { ADMIN_TRANSFERS_PAGE_SIZE, parseTransferNote, type TransferFilters, type TransferNoteError } from "@backend/lib/admin/transfer-rules";
import { findExistingOrderCodes, findOpenTransferTotals, findTransfersPage, resolveTransferRow } from "./admin-repository";

/**
 * Bank transfers that settled nothing (DECISIONS #45). The page and action layers check the Admin; this layer
 * applies the rules (lib/admin/transfer-rules.ts) and reads / writes through the repository.
 */
export type AdminTransferItem = {
  id: string;
  provider: string;
  externalId: string;
  reason: "NO_ORDER" | "AMOUNT_MISMATCH" | "ORDER_CLOSED";
  amountVnd: number;
  content: string;
  orderCode: string | null;
  /** The memo names an order that exists (the row links to it). */
  orderExists: boolean;
  bankAccount: string;
  isDemo: boolean;
  /** When the bank booked it (or, if not given, when the shop heard of it). */
  at: Date;
  resolved: { at: Date; by: string | null; note: string } | null;
};

export async function listUnmatchedTransfers(filters: TransferFilters) {
  const page = filters.page;
  const [total, rows] = await findTransfersPage(filters.state, (page - 1) * ADMIN_TRANSFERS_PAGE_SIZE, ADMIN_TRANSFERS_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_TRANSFERS_PAGE_SIZE));
  if (page > pageCount && total > 0) return listUnmatchedTransfers({ ...filters, page: pageCount });
  const existing = await findExistingOrderCodes(rows.flatMap((r) => (r.orderCode ? [r.orderCode] : [])));
  const items: AdminTransferItem[] = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    externalId: r.externalId,
    reason: r.reason,
    amountVnd: r.amountVnd,
    content: r.content,
    orderCode: r.orderCode,
    orderExists: !!r.orderCode && existing.has(r.orderCode),
    bankAccount: r.bankAccount,
    isDemo: r.isDemo,
    at: r.transferredAt ?? r.createdAt,
    resolved: r.resolvedAt ? { at: r.resolvedAt, by: r.resolvedBy?.email ?? null, note: r.resolutionNote ?? "" } : null,
  }));
  return { items, total, page: Math.min(page, pageCount), pageCount };
}

/** Transfers still waiting for an Admin — real money and test-mode transfers apart. */
export async function getOpenTransferTotals() {
  const groups = await findOpenTransferTotals();
  const pick = (isDemo: boolean) => {
    const g = groups.find((x) => x.isDemo === isDemo);
    return { count: g?._count._all ?? 0, amountVnd: g?._sum.amountVnd ?? 0 };
  };
  return { real: pick(false), demo: pick(true) };
}

export type ResolveTransferResult = { ok: true } | { ok: false; error: TransferNoteError | "notFound" | "alreadyResolved" };

export async function resolveUnmatchedTransfer(id: unknown, rawNote: unknown, adminId: string, now = new Date()): Promise<ResolveTransferResult> {
  if (typeof id !== "string" || !/^[a-z0-9]{10,40}$/.test(id)) return { ok: false, error: "notFound" };
  const note = parseTransferNote(rawNote);
  if (!note.ok) return { ok: false, error: note.error };
  return resolveTransferRow(id, note.note, adminId, now);
}
