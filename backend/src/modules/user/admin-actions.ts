"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@backend/auth/guards";
import { CATALOG_TAG } from "@backend/modules/product/queries";
import { giftAdminPack, lockAdminUser, revokeAdminGift, unlockAdminUser } from "./admin-service";

/**
 * Admin user actions (GĐ5.5) — thin: Admin check on every call (`.claude/rules/admin.md`), the service, then
 * the storefront cache + this page. The Admin always comes from the session, never from the form.
 */
export type AdminUserFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminUsers.errors. */
  error?: string;
  /** What was typed, to refill the form after an error. */
  values?: Record<string, string>;
  savedAt?: number;
};

async function adminOrNull() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

function done(): AdminUserFormState {
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", savedAt: Date.now() };
}

export async function lockUserAction(
  userId: string,
  _prev: AdminUserFormState,
  form: FormData,
): Promise<AdminUserFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const reason = field(form, "reason");
  const r = await lockAdminUser(userId, reason, admin.id);
  if (!r.ok) {
    if (r.error === "alreadyLocked" || r.error === "isAdmin") refresh(); // changed meanwhile: show the current state
    return { status: "error", error: r.error, values: { reason } };
  }
  return done();
}

export async function unlockUserAction(
  userId: string,
  _prev: AdminUserFormState,
  form: FormData,
): Promise<AdminUserFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const note = field(form, "note");
  const r = await unlockAdminUser(userId, note, admin.id);
  if (!r.ok) {
    if (r.error === "notLocked") refresh();
    return { status: "error", error: r.error, values: { note } };
  }
  return done();
}

export async function giftPackAction(
  userId: string,
  _prev: AdminUserFormState,
  form: FormData,
): Promise<AdminUserFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const productIds = form.getAll("productId").filter((v): v is string => typeof v === "string" && v.length > 0);
  const note = field(form, "note");
  const values = { productId: productIds.join(","), note };
  if (productIds.length === 0) return { status: "error", error: "pickPack", values };
  const r = await giftAdminPack(userId, productIds, note, admin.id);
  if (!r.ok) {
    if (r.error === "alreadyOwned" || r.error === "notPublished" || r.error === "notFound") refresh();
    return { status: "error", error: r.error, values };
  }
  return done();
}

export async function revokeGiftAction(
  userId: string,
  productId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  const r = await revokeAdminGift(userId, productId, admin.id);
  if (!r.ok) {
    refresh();
    return r;
  }
  done();
  return { ok: true };
}
