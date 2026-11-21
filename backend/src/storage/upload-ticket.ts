import { createHmac, timingSafeEqual } from "node:crypto";
import type { UploadFormat } from "@backend/lib/admin/upload-rules";
import { assertSafeKey, type Bucket } from "./types";

/**
 * Upload tickets for Admin uploads (GĐ5.3) — the local-driver stand-in for an R2 presigned PUT.
 * The server decides EVERYTHING about an upload when it issues the ticket (bucket, object key chosen by the
 * server, max size, declared format, what the file will be attached to, which Admin may use it); the browser
 * only sends bytes. The ticket is then checked twice: by the PUT route (writes the bytes) and by the finish
 * action (sniffs the bytes, creates the DB row). Expires after 30 minutes (large archives).
 *
 * Format: base64url(JSON) "." base64url(HMAC-SHA256), key derived from AUTH_SECRET with its own purpose label
 * (a download token can never be used as an upload ticket and the other way round).
 * No `server-only`: imported by unit tests.
 */
export type UploadTicket = {
  /** bucket */
  b: Bucket;
  /** object key (server-generated) */
  k: string;
  /** declared format (from the extension) */
  f: UploadFormat;
  /** max bytes */
  m: number;
  /** Admin user id allowed to use it */
  u: string;
  /** product id */
  p: string;
  /** attach to: a section's gallery (s), the pack gallery (neither), or a version's files (v) */
  s?: string;
  v?: string;
  /** original file name (shown, and the "save as" name of downloads) */
  n: string;
  /** expiry, unix seconds */
  e: number;
};

export const UPLOAD_TICKET_TTL_SECONDS = 30 * 60;
const PURPOSE = "asset-game/upload-ticket/v1";
const MAX_LENGTH = 4096;

const deriveKey = (secret: string) => createHmac("sha256", secret).update(PURPOSE).digest();
const sign = (body: string, secret: string) => createHmac("sha256", deriveKey(secret)).update(body).digest();

function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET là bắt buộc để ký vé tải lên.");
}

export function signUploadTicket(
  ticket: Omit<UploadTicket, "e">,
  secret: string | undefined,
  now = Date.now(),
  ttlSeconds = UPLOAD_TICKET_TTL_SECONDS,
): string {
  assertSecret(secret);
  assertSafeKey(ticket.k);
  const payload: UploadTicket = { ...ticket, e: Math.floor(now / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** The ticket when signed by us and not expired, else null. Never throws on hostile input. */
export function verifyUploadTicket(token: unknown, secret: string | undefined, now = Date.now()): UploadTicket | null {
  assertSecret(secret);
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_LENGTH) return null;
  const pieces = token.split(".");
  if (pieces.length !== 2) return null;
  const [body, sig] = pieces;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const expected = sign(body, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let t: unknown;
  try {
    t = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!t || typeof t !== "object") return null;
  const x = t as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 512;
  if ((x.b !== "public" && x.b !== "private") || !str(x.k) || !str(x.f) || !str(x.u) || !str(x.p) || !str(x.n))
    return null;
  if (
    typeof x.m !== "number" ||
    typeof x.e !== "number" ||
    (x.s !== undefined && !str(x.s)) ||
    (x.v !== undefined && !str(x.v))
  )
    return null;
  if (x.e * 1000 <= now) return null;
  try {
    assertSafeKey(x.k as string);
  } catch {
    return null;
  }
  return x as UploadTicket;
}
