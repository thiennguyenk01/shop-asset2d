import "server-only";
import { getEnv } from "@backend/env";
import { createStorage } from "./create";
import { signFileToken } from "./file-token";
import type { LocalStorage } from "./local";
import type { PresignedUpload, R2Storage } from "./r2";
import type { Bucket, StorageProvider } from "./types";

export type { Bucket, StorageProvider } from "./types";
export type { PresignedUpload } from "./r2";

let instance: LocalStorage | R2Storage | undefined;

function driver(): LocalStorage | R2Storage {
  instance ??= createStorage(getEnv());
  return instance;
}

export function getStorage(): StorageProvider {
  return driver();
}

/**
 * A short-lived URL (~60 s) that downloads ONE object of the PRIVATE bucket as an attachment.
 * Call only after the download service has checked the right to download (CLAUDE.md §7). Never store
 * the URL (DB, cache) and never render it into HTML — hand it to the browser once.
 * - local (dev): /api/files/<HMAC token>, served by frontend/src/app/api/files/[token]/route.ts
 * - r2 (GĐ7.5): a presigned GET on the R2 S3 endpoint, with Content-Disposition: attachment
 */
export async function signedDownloadUrl(key: string, filename: string): Promise<string> {
  const d = driver();
  if (d.driver === "local") return `/api/files/${signFileToken(key, filename, getEnv().AUTH_SECRET)}`;
  return d.presignDownload(key, filename);
}

/**
 * Where (and how) the browser sends the bytes of an Admin upload (GĐ5.3), for a ticket issued by the upload
 * service, whose bucket / key / size it repeats.
 * - local (dev): PUT /api/admin/uploads/<ticket> (frontend/src/app/api/admin/uploads/[ticket]/route.ts)
 * - r2 (GĐ7.5): a presigned PUT straight to the bucket; the returned headers are signed and must be sent as is
 */
export async function uploadTarget(
  ticket: string,
  bucket: Bucket,
  key: string,
  sizeBytes: number,
): Promise<PresignedUpload> {
  const d = driver();
  if (d.driver === "local") return { url: `/api/admin/uploads/${ticket}`, headers: {} };
  return d.presignUpload(bucket, key, sizeBytes);
}
