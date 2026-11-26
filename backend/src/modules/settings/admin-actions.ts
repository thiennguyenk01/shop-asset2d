"use server";

import { refresh, updateTag } from "next/cache";
import { requireAdmin } from "@backend/auth/guards";
import { CATALOG_TAG } from "@backend/modules/product/queries";
import { CONTACT_KINDS, type ContactError, type ContactKind } from "@backend/lib/contact/channels";
import { USAGE_TAG } from "@backend/modules/usage/service";
import { saveAdminSettings, saveContactChannels, setFreeTierOnly } from "./admin-service";
import { CONTACT_TAG } from "./service";

/**
 * Admin Settings action (GĐ5.6) — thin: Admin check (`.claude/rules/admin.md`), the service, then the storefront
 * cache + this page. The Admin always comes from the session, never from the form.
 */
export type AdminSettingsFormState = {
  status: "idle" | "success" | "error";
  /** Translation key under adminSettings.errors. */
  error?: string;
  /** Field name → error key under adminSettings.errors. */
  fields?: Record<string, string>;
  values?: Record<string, string>;
  /** false = the values were already saved (nothing changed). */
  changed?: boolean;
  savedAt?: number;
};

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

export async function saveSettingsAction(
  _prev: AdminSettingsFormState,
  form: FormData,
): Promise<AdminSettingsFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { status: "error", error: "forbidden" };
  }
  const values = {
    extraDownloadsCount: field(form, "extraDownloadsCount"),
    extraDownloadsPriceVnd: field(form, "extraDownloadsPriceVnd"),
  };
  const r = await saveAdminSettings(values, admin.id);
  if (!r.ok) return { status: "error", fields: r.fields, values };
  if (r.changed) updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", changed: r.changed, savedAt: Date.now() };
}

export type ContactFormState = {
  status: "idle" | "success" | "error";
  error?: "forbidden";
  /** Channel → error key under adminSettings.contactErrors. */
  fields?: Partial<Record<ContactKind, ContactError>>;
  /** What was typed, to fill the form again after an error. */
  values?: Partial<Record<ContactKind, string>>;
  changed?: boolean;
  savedAt?: number;
};

/**
 * Contact channels of the chat button (user choice 2026-11-26). Form: `order` (one per channel, top to bottom),
 * `value.<kind>` and `enabled.<kind>` (checkbox). The storefront list is cached under CONTACT_TAG.
 */
export async function saveContactAction(_prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { status: "error", error: "forbidden" };
  }
  const values: Partial<Record<ContactKind, string>> = {};
  const enabled: Partial<Record<ContactKind, boolean>> = {};
  for (const kind of CONTACT_KINDS) {
    values[kind] = field(form, `value.${kind}`);
    enabled[kind] = form.get(`enabled.${kind}`) === "on";
  }
  const r = await saveContactChannels({ order: form.getAll("order"), values, enabled }, admin.id);
  if (!r.ok) return { status: "error", fields: r.fields, values };
  if (r.changed) updateTag(CONTACT_TAG);
  refresh();
  return { status: "success", changed: r.changed, savedAt: Date.now() };
}

export type FreeTierFormState ={ status: "idle" | "success" | "error"; error?: "forbidden" | "confirm"; savedAt?: number; on?: boolean };

/** "Free plans only" on / off (Settings). `freeTierOnly` = the state asked for; `confirm` = the typed word. */
export async function setFreeTierAction(_prev: FreeTierFormState, form: FormData): Promise<FreeTierFormState> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { status: "error", error: "forbidden" };
  }
  const on = form.get("freeTierOnly") === "true";
  const r = await setFreeTierOnly(on, form.get("confirm"), admin.id);
  if (!r.ok) return { status: "error", error: r.error };
  updateTag(USAGE_TAG);
  refresh();
  return { status: "success", savedAt: Date.now(), on };
}
