/**
 * Admin uploads (GĐ5.3) — pure rules, unit tested (backend/tests/unit/admin-upload-rules.test.ts).
 *
 * - Preview media → PUBLIC bucket: PNG, JPG, WebP, GIF, MP4, WebM. **Never SVG** (CLAUDE.md §1: scriptable).
 * - Sellable files → PRIVATE bucket: one archive per pack version (ZIP, 7Z, RAR).
 * The extension picks what the file must be; `sniffFormat` then checks the first bytes of what actually
 * arrived, so a renamed file (an HTML page called .png, an .exe called .zip) is refused.
 */
export type UploadTarget = "media" | "file";
export type MediaFormat = "png" | "jpeg" | "webp" | "gif" | "mp4" | "webm";
export type ArchiveFormat = "zip" | "7z" | "rar";
export type UploadFormat = MediaFormat | ArchiveFormat;
export type MediaKindOf = "IMAGE" | "GIF" | "VIDEO";

const MB = 1024 * 1024;

type FormatInfo = { target: UploadTarget; ext: string; mime: string; maxBytes: number; kind?: MediaKindOf };

export const UPLOAD_FORMATS: Record<UploadFormat, FormatInfo> = {
  png: { target: "media", ext: "png", mime: "image/png", maxBytes: 10 * MB, kind: "IMAGE" },
  jpeg: { target: "media", ext: "jpg", mime: "image/jpeg", maxBytes: 10 * MB, kind: "IMAGE" },
  webp: { target: "media", ext: "webp", mime: "image/webp", maxBytes: 10 * MB, kind: "IMAGE" },
  gif: { target: "media", ext: "gif", mime: "image/gif", maxBytes: 20 * MB, kind: "GIF" },
  mp4: { target: "media", ext: "mp4", mime: "video/mp4", maxBytes: 100 * MB, kind: "VIDEO" },
  webm: { target: "media", ext: "webm", mime: "video/webm", maxBytes: 100 * MB, kind: "VIDEO" },
  // ProductFile.sizeBytes is an Int (< 2^31): 2 GB (decimal) fits.
  zip: { target: "file", ext: "zip", mime: "application/zip", maxBytes: 2_000_000_000 },
  "7z": { target: "file", ext: "7z", mime: "application/x-7z-compressed", maxBytes: 2_000_000_000 },
  rar: { target: "file", ext: "rar", mime: "application/vnd.rar", maxBytes: 2_000_000_000 },
};

const BY_EXTENSION: Record<string, UploadFormat> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  gif: "gif",
  mp4: "mp4",
  webm: "webm",
  zip: "zip",
  "7z": "7z",
  rar: "rar",
};

/** Accept attribute of the file pickers (the server still decides). */
export const ACCEPT: Record<UploadTarget, string> = {
  media: ".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm",
  file: ".zip,.7z,.rar",
};

/** How many media items one gallery (pack overview or one section) may hold, and files per version. */
export const MAX_MEDIA_PER_GALLERY = 30;
export const MAX_FILES_PER_VERSION = 10;

export type UploadPlanError = "badType" | "tooLarge" | "empty" | "badName";
export type UploadPlan =
  | { ok: true; format: UploadFormat; ext: string; mime: string; maxBytes: number }
  | { ok: false; error: UploadPlanError };

/** What an upload of `filename` (`size` bytes, as the browser reports it) to `target` would be. */
export function planUpload(target: UploadTarget, filename: string, size: number): UploadPlan {
  const name = filename.trim();
  if (!name || name.length > 200) return { ok: false, error: "badName" };
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const format = BY_EXTENSION[ext];
  if (!format || UPLOAD_FORMATS[format].target !== target) return { ok: false, error: "badType" };
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false, error: "empty" };
  const info = UPLOAD_FORMATS[format];
  if (size > info.maxBytes) return { ok: false, error: "tooLarge" };
  return { ok: true, format, ext: info.ext, mime: info.mime, maxBytes: info.maxBytes };
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The real format of a file from its first bytes, or null when it is none of the accepted ones. */
export function sniffFormat(head: Uint8Array): UploadFormat | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return "gif";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "webp";
  if (startsWith(head, ascii("ftyp"), 4)) return "mp4";
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7z";
  if (startsWith(head, ascii("Rar!\x1a\x07"))) return "rar";
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

/** Pixel size of an image from its first bytes (null for video, or when the header is not in `head`). */
export function imageSize(format: UploadFormat, head: Uint8Array): { width: number; height: number } | null {
  const ok = (width: number, height: number) =>
    width > 0 && height > 0 && width <= 100_000 && height <= 100_000 ? { width, height } : null;
  try {
    switch (format) {
      case "png":
        return head.length >= 24 ? ok(u32be(head, 16), u32be(head, 20)) : null;
      case "gif":
        return head.length >= 10 ? ok(u16le(head, 6), u16le(head, 8)) : null;
      case "webp": {
        if (head.length < 30) return null;
        const chunk = String.fromCharCode(...head.slice(12, 16));
        if (chunk === "VP8X") return ok(u24le(head, 24) + 1, u24le(head, 27) + 1);
        if (chunk === "VP8 ") return ok(u16le(head, 26) & 0x3fff, u16le(head, 28) & 0x3fff);
        if (chunk === "VP8L") {
          const b = head.slice(21, 25);
          return ok(
            1 + (((b[1] & 0x3f) << 8) | b[0]),
            1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)),
          );
        }
        return null;
      }
      case "jpeg": {
        // Walk the markers up to the first "start of frame" (SOF0..SOF15 except DHT/JPG/DAC).
        let i = 2;
        while (i + 9 < head.length) {
          if (head[i] !== 0xff) return null;
          const marker = head[i + 1];
          if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
            i += 2;
            continue;
          }
          const len = u16be(head, i + 2);
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
            return ok(u16be(head, i + 7), u16be(head, i + 5));
          if (len < 2) return null;
          i += 2 + len;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Storage-safe extension → the media kind stored on ProductMedia. */
export function mediaKindOf(format: UploadFormat): MediaKindOf | null {
  return UPLOAD_FORMATS[format].kind ?? null;
}

// ───────────────────────────── Versions ─────────────────────────────

export const VERSION_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

function parts(v: string): [number, number, number] | null {
  const m = VERSION_RE.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative / 0 / positive like a sort comparator; unparsable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Suggested next version: the minor after the highest existing one (1.2.3 → 1.3.0). */
export function suggestNextVersion(existing: string[]): string {
  const top = existing
    .filter((v) => parts(v))
    .sort(compareVersions)
    .pop();
  if (!top) return "1.0.0";
  const [major, minor] = parts(top)!;
  return minor >= 999 ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`;
}

export type VersionError = "versionFormat" | "versionNotNewer";

/** A new version number must be x.y.z and higher than every version the pack already has. */
export function checkNewVersion(version: string, existing: string[]): VersionError | null {
  if (!parts(version)) return "versionFormat";
  if (existing.some((v) => compareVersions(version, v) <= 0)) return "versionNotNewer";
  return null;
}

/** Human file size, e.g. "12,4 MB" (number formatting is done by the caller's formatter). */
export function sizeParts(bytes: number): { value: number; unit: "B" | "KB" | "MB" | "GB" } {
  if (bytes < 1024) return { value: bytes, unit: "B" };
  if (bytes < MB) return { value: Math.round((bytes / 1024) * 10) / 10, unit: "KB" };
  if (bytes < 1024 * MB) return { value: Math.round((bytes / MB) * 10) / 10, unit: "MB" };
  return { value: Math.round((bytes / (1024 * MB)) * 100) / 100, unit: "GB" };
}
