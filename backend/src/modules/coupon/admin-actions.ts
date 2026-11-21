"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { requireAdmin } from "@backend/auth/guards";
import { setFlash } from "@backend/flash";
import { CATALOG_TAG } from "@backend/modules/product/queries";
import { createAdminCoupon, deleteAdminCoupon, updateAdminCoupon } from "./admin-service";

/**
 * Admin coupon actions (GĐ5.6, DECISIONS #35) — thin: Admin check on every call (`.claude/rules/admin.md`), the
 * service, then the storefront cache + this page. The Admin always comes from the session, never from the form.
 */
export type AdminCouponFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminCoupons.errors. */
  error?: string;
  /** Field name → error key under adminCoupons.errors. */
  fields?: Record<string, string>;
  /** What was typed, to refill the form after an error (React resets uncontrolled inputs). */
  values?: Record<string, string>;
  changed?: boolean;
  savedAt?: number;
};

const FIELDS = ["code", "kind", "value", "minTotalVnd", "startsAt", "endsAt", "maxUses", "maxUsesPerUser"] as const;
const safeLocale = (l: string): Locale =>
  (routing.locales as readonly string[]).includes(l) ? (l as Locale) : routing.defaultLocale;

async function adminOrNull() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function readForm(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of FIELDS) {
    const v = form.get(name);
    values[name] = typeof v === "string" ? v : "";
  }
  values.isActive = form.get("isActive") === "on" ? "on" : "";
  return values;
}

export async function createCouponAction(
  locale: string,
  _prev: AdminCouponFormState,
  form: FormData,
): Promise<AdminCouponFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const values = readForm(form);
  const r = await createAdminCoupon(values, admin.id);
  if (!r.ok) return { status: "error", error: r.error, fields: r.fields, values };
  updateTag(CATALOG_TAG);
  await setFlash("couponCreated");
  redirect({ href: `/admin/coupons/${r.id}`, locale: safeLocale(locale) });
  return { status: "success" };
}

export async function updateCouponAction(
  id: string,
  _prev: AdminCouponFormState,
  form: FormData,
): Promise<AdminCouponFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const values = readForm(form);
  const r = await updateAdminCoupon(id, values, admin.id);
  if (!r.ok) {
    if (r.fields && Object.values(r.fields).includes("locked")) refresh(); // used meanwhile: show the lock
    return { status: "error", error: r.error, fields: r.fields, values };
  }
  if (r.changed) updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", changed: r.changed, savedAt: Date.now() };
}

export async function deleteCouponAction(locale: string, id: string): Promise<{ ok: false; error: string } | void> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  const r = await deleteAdminCoupon(id, admin.id);
  if (!r.ok) {
    refresh();
    return r;
  }
  updateTag(CATALOG_TAG);
  await setFlash("couponDeleted");
  redirect({ href: "/admin/coupons", locale: safeLocale(locale) });
}
