import "server-only";
import type { UnmatchedTransferReason } from "@backend/generated/prisma/client";
import { getDb } from "@backend/db";
import type { ProviderId } from "./providers";

/**
 * Bank transfers that settled nothing (user choice 2026-11-20: kept for an Admin, never granted automatically).
 * One row per gateway transaction: a replayed notification changes nothing.
 */
export async function insertUnmatchedTransfer(row: {
  provider: ProviderId;
  externalId: string;
  reason: UnmatchedTransferReason;
  amountVnd: number;
  content: string;
  orderCode: string | null;
  bankAccount: string;
  /** The gateway's test mode reported it: no real money moved. */
  isDemo: boolean;
  transferredAt: Date | null;
  payload: object;
}): Promise<boolean> {
  const { count } = await getDb().unmatchedTransfer.createMany({ data: [row], skipDuplicates: true });
  return count === 1;
}
