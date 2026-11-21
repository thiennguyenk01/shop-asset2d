/**
 * Bank transfers that settled nothing (UnmatchedTransfer, DECISIONS #45: "ghi lại, Admin xem danh sách"), pure so
 * they are unit-tested: the list filter from the URL (unknown values are ignored, never an error) and the note an
 * Admin writes when marking a transfer handled.
 */
export const TRANSFER_STATES = ["open", "resolved", "all"] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];
export const ADMIN_TRANSFERS_PAGE_SIZE = 20;
export const TRANSFER_NOTE_MAX = 500;

export type TransferFilters = { state: TransferState; page: number };

/** Default: the ones still waiting for an Admin. */
export function parseTransferFilters(raw: { state?: string; page?: string }): TransferFilters {
  const state = TRANSFER_STATES.find((s) => s === raw.state) ?? "open";
  const n = Number(raw.page ?? 1);
  return { state, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
}

export type TransferNoteError = "noteRequired" | "noteTooLong";

/** What the Admin did about it (contacted the buyer, refunded outside the site…): required, trimmed, ≤ 500. */
export function parseTransferNote(raw: unknown): { ok: true; note: string } | { ok: false; error: TransferNoteError } {
  const note = typeof raw === "string" ? raw.trim() : "";
  if (!note) return { ok: false, error: "noteRequired" };
  if (note.length > TRANSFER_NOTE_MAX) return { ok: false, error: "noteTooLong" };
  return { ok: true, note };
}
