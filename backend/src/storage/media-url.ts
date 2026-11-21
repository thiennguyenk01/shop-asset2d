import "server-only";
import { getEnv } from "@backend/env";
import { publicObjectUrl } from "./r2-rules";
import { assertSafeKey } from "./types";

/**
 * Public URL of an object in the PUBLIC media bucket (previews, thumbnails, gallery).
 * - local driver (dev): served by frontend/src/app/media/[...key]/route.ts
 * - r2 (GĐ7.5): `R2_PUBLIC_BASE_URL` (the custom domain connected to the public bucket, or r2.dev while testing)
 * Never use this for the PRIVATE bucket — sellable files are only reachable through the
 * ownership-checked download route (CLAUDE.md §7).
 */
export function mediaUrl(key: string): string {
  assertSafeKey(key);
  const env = getEnv();
  if (env.STORAGE_DRIVER === "local") return `/media/${key}`;
  return publicObjectUrl(env.R2_PUBLIC_BASE_URL!, key);
}
