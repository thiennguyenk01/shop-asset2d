import { getEnv } from "@backend/env";
import { LocalStorage } from "@backend/storage/local";
import { assertSafeKey } from "@backend/storage/types";

/**
 * Dev-only server for the PUBLIC media bucket of the local storage driver.
 * - Reads ONLY the "public" bucket. Sellable files live in "private" and are never served here.
 * - Only whitelisted media types; anything else is a 404.
 * - SVG is served with a locked-down CSP + sandbox so a malicious upload could not run script.
 * In production (R2) this route always 404s — media comes from the R2 public domain.
 */

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

const HEADERS = {
  "Cache-Control": "public, max-age=3600",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Accept-Ranges": "bytes",
};

/** One "bytes=a-b" / "bytes=a-" / "bytes=-n" range inside `size`, or null (→ whole file / 416). */
function parseRange(header: string, size: number): { start: number; end: number } | "invalid" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? { start, end } : "invalid";
}

export async function GET(request: Request, { params }: RouteContext<"/media/[...key]">) {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "local") return notFound();

  const key = (await params).key.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return notFound();
  }
  const contentType = TYPES[key.split(".").pop() ?? ""];
  if (!contentType) return notFound();

  const storage = new LocalStorage(env.STORAGE_LOCAL_ROOT);
  const size = await storage.size("public", key);
  if (size === null) return notFound();

  // Videos are played with range requests (seeking); images are small and sent whole.
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;
  if (range === "invalid")
    return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${size}` } });
  if (range) {
    return new Response(storage.readRange("public", key, range.start, range.end), {
      status: 206,
      headers: {
        ...HEADERS,
        "Content-Type": contentType,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }
  const body = await storage.read("public", key);
  return new Response(body, {
    headers: { ...HEADERS, "Content-Type": contentType, "Content-Length": String(body.byteLength) },
  });
}
