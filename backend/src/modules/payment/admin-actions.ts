"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@backend/auth/guards";
import { resolveUnmatchedTransfer } from "./admin-service";

/**
 * Admin action on bank transfers that settled nothing (DECISIONS #45) — thin: Admin check on every call
 * (`.claude/rules/admin.md`), then the service. Nothing in the shop's catalog changes, so no cache tag.
 */
export type ResolveTransferState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminTransfers.errors. */
  error?: string;
  /** The typed note, to refill the form after an error. */
  values?: { note: string };
  savedAt?: number;
};

export async function resolveTransferAction(id: string, _prev: ResolveTransferState, form: FormData): Promise<ResolveTransferState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { status: "error", error: "forbidden" };
  }
  const raw = form.get("note");
  const note = typeof raw === "string" ? raw : "";
  const result = await resolveUnmatchedTransfer(id, note, admin.id);
  if (!result.ok) {
    if (result.error === "alreadyResolved") refresh(); // another Admin handled it meanwhile: show the current state
    return { status: "error", error: result.error, values: { note } };
  }
  refresh();
  return { status: "success", savedAt: Date.now() };
}
