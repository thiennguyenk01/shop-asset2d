import { safeFilename } from "./file-token";
import { assertSafeKey, type Bucket } from "./types";

/**
 * Pure rules of the Cloudflare R2 driver (GĐ7.5), unit-tested without a network: endpoint, public URLs, the
 * metadata stored with each object, the "save as" header of downloads. No `server-only`: imported by tests.
 */

/** S3 API endpoint of an account. Presigned URLs work ONLY on this host (never on the public custom domain). */
export const r2Endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

/** Public URL of a PUBLIC-bucket object: the custom domain (or r2.dev) + the key. */
export function publicObjectUrl(baseUrl: string, key: string): string {
  assertSafeKey(key);
  return `${baseUrl.replace(/\/+$/, "")}/${key}`;
}

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/** Content-Type stored with an object, from its (server-chosen) extension. */
export function contentTypeFor(key: string): string {
  const ext = key.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

/**
 * Cache-Control stored with an object. Public uploads (`packs/…`) get a random key per upload and are never
 * rewritten, so the browser / Cloudflare may keep them a year; other public objects (demo pictures, whose keys the
 * seed reuses) an hour. Private objects are only fetched through a one-minute link: never cached.
 */
export function cacheControlFor(bucket: Bucket, key: string): string {
  if (bucket === "private") return "private, no-store";
  return key.startsWith("packs/") ? "public, max-age=31536000, immutable" : "public, max-age=3600";
}

/**
 * `Content-Disposition` of a download link: always an attachment, with an ASCII fallback name and the real
 * (UTF-8) name for browsers that read `filename*` (RFC 6266 / 5987).
 */
export function attachmentDisposition(filename: string): string {
  const name = safeFilename(filename);
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[%;]/g, "_").trim() || "download";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Download links live one minute, like the local driver's tokens (CLAUDE.md: short-lived, never stored). */
export const R2_DOWNLOAD_TTL_SECONDS = 60;
/** Upload links (Admin) live as long as the upload ticket: large archives take a while. */
export const R2_UPLOAD_TTL_SECONDS = 30 * 60;
