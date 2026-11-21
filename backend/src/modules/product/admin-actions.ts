"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { fieldErrors, productFormData, productFormSchema, sectionFormData, sectionFormSchema } from "@backend/lib/admin/product-rules";
import { requireAdmin } from "@backend/auth/guards";
import { setFlash } from "@backend/flash";
import {
  addAdminSection,
  createAdminDraft,
  deleteAdminProduct,
  deleteAdminSection,
  setAdminProductStatus,
  updateAdminProduct,
  updateAdminSection,
} from "./admin-service";
import { CATALOG_TAG } from "./queries";

/**
 * Admin pack actions (GĐ5.2) — thin layer: Admin check (every action, CLAUDE.md §3), parse with the shared
 * rules, call the service, refresh the storefront cache (`updateTag` → the next request reads fresh data, the
 * admin sees the change at once). Non-admins get "forbidden" and nothing else.
 */
export type AdminFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminProducts.errors. */
  error?: string;
  /** Field name (as in the form) → error key. */
  fields?: Record<string, string>;
  /** The submitted values, to refill the form after an error (React resets uncontrolled inputs). */
  values?: Record<string, string | string[]>;
  savedAt?: number;
};

const safeLocale = (l: string): Locale => ((routing.locales as readonly string[]).includes(l) ? (l as Locale) : routing.defaultLocale);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

async function adminOrNull() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

/** Fields sent as several values (ticked chips). */
const LIST_FIELDS = new Set(["genreIds", "artStyleIds", "resolution", "compatibleSoftware", "fileFormats"]);

function formValues(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$")) continue; // React's action bookkeeping
    const all = form.getAll(key).map(String);
    out[key] = LIST_FIELDS.has(key) ? all : all[0];
  }
  return out;
}

/** Zod paths → the form's field names ("translations.vi.title" → "vi.title"). */
function formFieldErrors(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.replace(/^translations\./, ""), v]));
}

/** "New pack" (2026-11-21): create an empty draft and open the full editor at once (no first save needed). */
export async function createDraftAction(locale: string): Promise<StatusActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  const result = await createAdminDraft(admin.id);
  if (!result.ok) return { ok: false, error: "generic" };
  await setFlash("packCreated");
  redirect({ href: `/admin/products/${result.id}`, locale: safeLocale(locale) });
  return { ok: true };
}

export async function updateProductAction(productId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  if (!isId(productId)) return { status: "error", error: "notFound" };
  const parsed = productFormSchema.safeParse(productFormData(form));
  if (!parsed.success) return { status: "error", fields: formFieldErrors(fieldErrors(parsed.error)), values: formValues(form) };
  const result = await updateAdminProduct(productId, parsed.data, admin.id);
  if (!result.ok) return { status: "error", error: result.fields ? undefined : result.error, fields: result.fields && formFieldErrors(result.fields), values: formValues(form) };
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", savedAt: Date.now() };
}

export type StatusActionResult = { ok: true } | { ok: false; error: string };

export async function setProductStatusAction(locale: string, productId: string, status: "DRAFT" | "PUBLISHED" | "HIDDEN"): Promise<StatusActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !["DRAFT", "PUBLISHED", "HIDDEN"].includes(status)) return { ok: false, error: "notFound" };
  const result = await setAdminProductStatus(productId, status, admin.id, safeLocale(locale));
  if (!result.ok) return result;
  updateTag(CATALOG_TAG);
  refresh();
  return { ok: true };
}

export async function deleteProductAction(locale: string, productId: string): Promise<StatusActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId)) return { ok: false, error: "notFound" };
  const result = await deleteAdminProduct(productId, admin.id);
  if (!result.ok) return result;
  updateTag(CATALOG_TAG);
  await setFlash("packDeleted");
  redirect({ href: "/admin/products", locale: safeLocale(locale) });
  return { ok: true };
}

export async function addSectionAction(locale: string, productId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  const categoryId = form.get("categoryId");
  if (!isId(productId) || !isId(categoryId)) return { status: "error", error: "pickCategory" };
  const result = await addAdminSection(productId, categoryId, admin.id, safeLocale(locale));
  if (!result.ok) return { status: "error", error: result.error === "exists" ? "sectionExists" : "notFound" };
  updateTag(CATALOG_TAG);
  await setFlash("sectionAdded");
  redirect({ href: `/admin/products/${productId}/sections/${result.sectionId}`, locale: safeLocale(locale) });
  return { status: "success" };
}

export async function updateSectionAction(productId: string, sectionId: string, _prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  if (!isId(productId) || !isId(sectionId)) return { status: "error", error: "notFound" };
  const parsed = sectionFormSchema.safeParse(sectionFormData(form));
  if (!parsed.success) return { status: "error", fields: formFieldErrors(fieldErrors(parsed.error)), values: formValues(form) };
  const result = await updateAdminSection(productId, sectionId, parsed.data, admin.id);
  if (!result.ok) {
    return "fields" in result && result.fields
      ? { status: "error", fields: formFieldErrors(result.fields), values: formValues(form) }
      : { status: "error", error: "notFound" };
  }
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", savedAt: Date.now() };
}

export async function deleteSectionAction(locale: string, productId: string, sectionId: string): Promise<StatusActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(sectionId)) return { ok: false, error: "notFound" };
  const result = await deleteAdminSection(productId, sectionId, admin.id);
  if (!result.ok) return result;
  updateTag(CATALOG_TAG);
  await setFlash("sectionDeleted");
  redirect({ href: `/admin/products/${productId}`, locale: safeLocale(locale) });
  return { ok: true };
}
