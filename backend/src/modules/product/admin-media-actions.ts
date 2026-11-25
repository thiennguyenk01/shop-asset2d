"use server";

import { refresh, updateTag } from "next/cache";
import { ADMIN_LOCALES } from "@backend/lib/admin/product-rules";
import type { UploadTarget } from "@backend/lib/admin/upload-rules";
import { requireAdmin } from "@backend/auth/guards";
import { USAGE_TAG } from "@backend/modules/usage/service";
import type { AdminFormState } from "./admin-actions";
import {
  createAdminVersion,
  deleteAdminFile,
  deleteAdminMedia,
  deleteAdminVersion,
  finishUpload,
  moveAdminMedia,
  releaseAdminVersion,
  setAdminCover,
  startUpload,
  updateAdminVersion,
} from "./admin-media-service";
import { CATALOG_TAG } from "./queries";

/**
 * Admin media / files / versions actions (GĐ5.3) — thin: Admin check on every call (CLAUDE.md §3), plain-value
 * validation of what the browser sent, the service, then the storefront cache (`updateTag`) + the page (`refresh`).
 */
export type MediaActionResult = { ok: true } | { ok: false; error: string };

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

async function adminOrNull() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function done(): MediaActionResult {
  updateTag(CATALOG_TAG);
  refresh();
  return { ok: true };
}

export type StartUploadActionResult =
  | { ok: true; ticket: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string };

export async function startUploadAction(input: {
  productId: string;
  target: UploadTarget;
  sectionId?: string | null;
  versionId?: string | null;
  filename: string;
  size: number;
}): Promise<StartUploadActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!input || !isId(input.productId) || (input.target !== "media" && input.target !== "file"))
    return { ok: false, error: "notFound" };
  if ((input.sectionId != null && !isId(input.sectionId)) || (input.versionId != null && !isId(input.versionId)))
    return { ok: false, error: "notFound" };
  if (typeof input.filename !== "string" || typeof input.size !== "number") return { ok: false, error: "badName" };
  return startUpload(
    {
      productId: input.productId,
      target: input.target,
      sectionId: input.sectionId ?? null,
      versionId: input.versionId ?? null,
      filename: input.filename,
      size: input.size,
    },
    admin.id,
  );
}

export async function finishUploadAction(ticket: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (typeof ticket !== "string") return { ok: false, error: "badTicket" };
  const result = await finishUpload(ticket, admin.id);
  if (!result.ok) {
    if (result.error !== "badTicket") refresh();
    return result;
  }
  updateTag(USAGE_TAG); // the next upload is checked against the free storage with this file counted
  return done();
}

export async function setCoverAction(productId: string, mediaId: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(mediaId)) return { ok: false, error: "notFound" };
  const r = await setAdminCover(productId, mediaId, admin.id);
  return r.ok ? done() : r;
}

export async function moveMediaAction(
  productId: string,
  mediaId: string,
  direction: "up" | "down",
): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(mediaId) || (direction !== "up" && direction !== "down"))
    return { ok: false, error: "notFound" };
  const r = await moveAdminMedia(productId, mediaId, direction, admin.id);
  return r.ok ? done() : r;
}

export async function deleteMediaAction(productId: string, mediaId: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(mediaId)) return { ok: false, error: "notFound" };
  const r = await deleteAdminMedia(productId, mediaId, admin.id);
  return r.ok ? done() : r;
}

export async function deleteFileAction(productId: string, fileId: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(fileId)) return { ok: false, error: "notFound" };
  const r = await deleteAdminFile(productId, fileId, admin.id);
  return r.ok ? done() : r;
}

function versionInput(form: FormData) {
  const s = (k: string) =>
    String(form.get(k) ?? "")
      .trim()
      .slice(0, 2000);
  return {
    version: s("version"),
    changelog: Object.fromEntries(ADMIN_LOCALES.map((l) => [l, s(`${l}.changelog`)])) as Record<
      "vi" | "en" | "zh",
      string
    >,
  };
}
const versionValues = (form: FormData) =>
  Object.fromEntries(
    ["version", ...ADMIN_LOCALES.map((l) => `${l}.changelog`)].map((k) => [k, String(form.get(k) ?? "")]),
  );

/** Create (versionId null) or edit a draft version. */
export async function saveVersionAction(
  productId: string,
  versionId: string | null,
  _prev: AdminFormState,
  form: FormData,
): Promise<AdminFormState> {
  const admin = await adminOrNull();
  if (!admin) return { status: "error", error: "forbidden" };
  if (!isId(productId) || (versionId !== null && !isId(versionId))) return { status: "error", error: "notFound" };
  const input = versionInput(form);
  const r = versionId
    ? await updateAdminVersion(productId, versionId, input, admin.id)
    : await createAdminVersion(productId, input, admin.id);
  if (!r.ok) {
    const fields = r.fields;
    return { status: "error", error: fields ? undefined : r.error, fields, values: versionValues(form) };
  }
  updateTag(CATALOG_TAG);
  refresh();
  return { status: "success", savedAt: Date.now() };
}

export async function releaseVersionAction(productId: string, versionId: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(versionId)) return { ok: false, error: "notFound" };
  const r = await releaseAdminVersion(productId, versionId, admin.id);
  return r.ok ? done() : r;
}

export async function deleteVersionAction(productId: string, versionId: string): Promise<MediaActionResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, error: "forbidden" };
  if (!isId(productId) || !isId(versionId)) return { ok: false, error: "notFound" };
  const r = await deleteAdminVersion(productId, versionId, admin.id);
  return r.ok ? done() : r;
}
