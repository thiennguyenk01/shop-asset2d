import "server-only";
import {
  parseSettingsForm,
  type ExtraDownloadsSettings,
  type SettingsError,
  type SettingsField,
} from "@backend/lib/admin/settings-rules";
import { DEFAULT_EXTRA_DOWNLOADS } from "@backend/lib/download/rules";
import { findSettingsHistory, saveShopSettingsRows } from "./admin-repository";
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
  const [extraDownloads, history] = await Promise.all([getExtraDownloadsOffer(), findSettingsHistory(10)]);
  return {
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
