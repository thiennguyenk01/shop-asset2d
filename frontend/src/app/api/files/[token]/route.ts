import { getEnv } from "@backend/env";
import { verifyFileToken } from "@backend/storage/file-token";
import { LocalStorage } from "@backend/storage/local";

/**
 * Dev-only stand-in for an R2 presigned URL (CLAUDE.md §7): serves ONE private object named by a
 * short-lived HMAC token minted by the download service after its ownership checks. No token, a
 * tampered or expired token, or another storage driver → 404 (never a hint about what exists).
 * Always an attachment, never rendered by the browser, never cached.
 */
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** RFC 6266 / 5987: ASCII fallback + UTF-8 name. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(_request: Request, { params }: RouteContext<"/api/files/[token]">) {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "local") return notFound();

  const payload = verifyFileToken((await params).token, env.AUTH_SECRET);
  if (!payload) return notFound();

  const storage = new LocalStorage(env.STORAGE_LOCAL_ROOT);
  if (!(await storage.exists("private", payload.k))) return notFound();
  const body = await storage.read("private", payload.k);

  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(payload.f),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
