"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import type { DownloadBlock } from "@backend/lib/download/rules";
import { getSessionUser } from "@backend/auth/guards";
import { requestDownload } from "./service";

/**
 * Download entry point for the UI (thin layer, CLAUDE.md §3/§7). A server action rather than a plain GET
 * link: it is POST-only with Next's origin check (another site cannot make a signed-in visitor spend their
 * free downloads via an <img>), and failures come back as data so the page can show a toast instead of an
 * error page. The user always comes from the session (re-validated against sessionVersion), never from the client.
 */
export type DownloadActionResult =
  | { status: "ok"; url: string; inLibrary: boolean; claimed: boolean; remaining: number | null }
  | { status: "blocked"; reason: DownloadBlock };

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

export async function requestDownloadAction(productId: string, fileId?: string | null): Promise<DownloadActionResult> {
  if (!isId(productId) || (fileId != null && !isId(fileId))) return { status: "blocked", reason: "notFound" };
  const [user, h] = await Promise.all([getSessionUser(), headers()]);
  if (!user) return { status: "blocked", reason: "signInRequired" };
  const result = await requestDownload({
    productId,
    fileId: fileId ?? null,
    userId: user.id,
    userAgent: h.get("user-agent")?.slice(0, 256) ?? null,
  });
  if (!result.ok) {
    if (result.reason === "quotaExhausted") refresh(); // e.g. used up in another tab: show "no downloads left"
    return { status: "blocked", reason: result.reason };
  }
  refresh(); // downloads left, library + download history (and "in your library" after a first claim)
  return { status: "ok", url: result.url, inLibrary: result.inLibrary, claimed: result.claimed, remaining: result.remaining };
}
