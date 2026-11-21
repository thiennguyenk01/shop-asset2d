import "server-only";
import {
  parseSettingsForm,
  type ExtraDownloadsSettings,
  type SettingsError,
  type SettingsField,
} from "@backend/lib/admin/settings-rules";
import { DEFAULT_EXTRA_DOWNLOADS } from "@backend/lib/download/rules";
import { freeTierOpenConfirmed } from "@backend/lib/admin/settings-rules";
import { findSettingsHistory, saveFreeTierOnlyRow, saveShopSettingsRows } from "./admin-repository";
import { findShopSettings } from "./repository";
import { getExtraDownloadsOffer } from "./service";

/**
 * Admin Settings (GĐ5.6, DECISIONS #35): the "more downloads" offer for free packs — downloads per purchase and
 * price. The page and action layers check the Admin; this layer applies lib/admin/settings-rules.ts.
 */
const DEFAULTS: ExtraDownloadsSettings = {
  count: DEFAULT_EXTRA_DOWNLOADS.count,
  priceVnd: DEFAULT_EXTRA_DOWNLOADS.priceVnd,
};

export type AdminSettingsView = {
  /** "Free plans only" (user choice 2026-11-22): on until the Admin turns it off. */
  freeTierOnly: boolean;
  extraDownloads: ExtraDownloadsSettings;
  defaults: ExtraDownloadsSettings;
  history: {
    at: Date;
    adminEmail: string;
    before: ExtraDownloadsSettings | null;
    after: ExtraDownloadsSettings | null;
  }[];
};

const asOffer = (v: unknown): ExtraDownloadsSettings | null => {
  if (!v || typeof v !== "object") return null;
  const { count, priceVnd } = v as Record<string, unknown>;
  return typeof count === "number" && typeof priceVnd === "number" ? { count, priceVnd } : null;
};

export async function getAdminSettings(): Promise<AdminSettingsView> {
  const [extraDownloads, history, row] = await Promise.all([getExtraDownloadsOffer(), findSettingsHistory(10), findShopSettings()]);
  return {
    freeTierOnly: row?.freeTierOnly ?? true,
    extraDownloads,
    defaults: DEFAULTS,
    history: history.map((h) => {
      const diff = (h.diff ?? {}) as { extraDownloads?: { before?: unknown; after?: unknown } };
      return {
        at: h.createdAt,
        adminEmail: h.admin.email,
        before: asOffer(diff.extraDownloads?.before),
        after: asOffer(diff.extraDownloads?.after),
      };
    }),
  };
}

export type SaveSettingsResult =
  { ok: true; changed: boolean } | { ok: false; fields: Partial<Record<SettingsField, SettingsError>> };

export async function saveAdminSettings(
  raw: { extraDownloadsCount?: unknown; extraDownloadsPriceVnd?: unknown },
  adminId: string,
): Promise<SaveSettingsResult> {
  const parsed = parseSettingsForm(raw);
  if (!parsed.ok) return parsed;
  return { ok: true, changed: await saveShopSettingsRows(parsed.value, DEFAULTS, adminId) };
}

export type SetFreeTierResult = { ok: true; changed: boolean } | { ok: false; error: "confirm" };

/** Turning the mode off needs the typed word (FREE_TIER_OPEN_WORD); turning it back on needs nothing. */
export async function setFreeTierOnly(value: boolean, typed: unknown, adminId: string): Promise<SetFreeTierResult> {
  if (!value && !freeTierOpenConfirmed(typed)) return { ok: false, error: "confirm" };
  return { ok: true, changed: await saveFreeTierOnlyRow(value, DEFAULTS, adminId) };
}
