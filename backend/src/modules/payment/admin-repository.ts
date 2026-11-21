import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { TransferState } from "@backend/lib/admin/transfer-rules";
import { getDb } from "@backend/db";

/**
 * Bank transfers that settled nothing (UnmatchedTransfer, DECISIONS #45), for the Admin. Read-only except marking
 * one handled: the row itself (amount, memo, gateway payload) is never edited or deleted.
 */
const stateWhere = (state: TransferState): Prisma.UnmatchedTransferWhereInput =>
  state === "open" ? { resolvedAt: null } : state === "resolved" ? { resolvedAt: { not: null } } : {};

export function findTransfersPage(state: TransferState, skip: number, take: number) {
  const where = stateWhere(state);
  return Promise.all([
    getDb().unmatchedTransfer.count({ where }),
    getDb().unmatchedTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        provider: true,
        externalId: true,
        reason: true,
        amountVnd: true,
        content: true,
        orderCode: true,
        bankAccount: true,
        isDemo: true,
        transferredAt: true,
        createdAt: true,
        resolvedAt: true,
        resolutionNote: true,
        resolvedBy: { select: { email: true } },
      },
    }),
  ]);
}

/** Which of these order codes exist (a memo may name a code no order has). */
export async function findExistingOrderCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const rows = await getDb().order.findMany({ where: { code: { in: codes } }, select: { code: true } });
  return new Set(rows.map((r) => r.code));
}

/** Transfers still waiting for an Admin: count and money, real and test apart. */
export function findOpenTransferTotals() {
  return getDb().unmatchedTransfer.groupBy({
    by: ["isDemo"],
    where: { resolvedAt: null },
    _count: { _all: true },
    _sum: { amountVnd: true },
  });
}

/**
 * Mark one transfer handled, in ONE transaction with its AuditLog row (`.claude/rules/admin.md`). Conditional on
 * "not handled yet", so a second click or a second Admin changes nothing.
 */
export function resolveTransferRow(id: string, note: string, adminId: string, now: Date) {
  return getDb().$transaction(async (tx) => {
    const row = await tx.unmatchedTransfer.findUnique({
      where: { id },
      select: { id: true, provider: true, externalId: true, reason: true, amountVnd: true, orderCode: true, isDemo: true },
    });
    if (!row) return { ok: false as const, error: "notFound" as const };
    const { count } = await tx.unmatchedTransfer.updateMany({
      where: { id, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: adminId, resolutionNote: note },
    });
    if (count === 0) return { ok: false as const, error: "alreadyResolved" as const };
    await tx.auditLog.create({
      data: {
        adminId,
        action: "transfer.resolve",
        entity: "UnmatchedTransfer",
        entityId: id,
        diff: {
          provider: row.provider,
          externalId: row.externalId,
          reason: row.reason,
          amountVnd: row.amountVnd,
          orderCode: row.orderCode,
          isDemo: row.isDemo,
          note,
        },
      },
    });
    return { ok: true as const };
  });
}
