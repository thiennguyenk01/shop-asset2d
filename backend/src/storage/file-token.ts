import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSafeKey } from "./types";

/**
 * Short-lived signed download links for the LOCAL storage driver (CLAUDE.md §2, §7) — the dev stand-in
 * for an R2 presigned URL. A token names ONE private object + the filename to save it as, and expires
 * after ~60 s. It is only ever minted by the download service AFTER the ownership checks, so holding a
 * token proves nothing beyond "the server allowed this one download a moment ago".
 *
 * Format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload)). The key is derived from
 * AUTH_SECRET with a purpose label, so a token can never be confused with any other signed value.
 * No `server-only` here: imported directly by unit tests.
 */
export type FileTokenPayload = { k: string; f: string; e: number };

export const FILE_TOKEN_TTL_SECONDS = 60;
const PURPOSE = "asset-game/file-token/v1";
const MAX_TOKEN_LENGTH = 2048;

const deriveKey = (secret: string) => createHmac("sha256", secret).update(PURPOSE).digest();
const sign = (body: string, secret: string) => createHmac("sha256", deriveKey(secret)).update(body).digest();

function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET là bắt buộc để ký link tải.");
}

/** Safe "save as" name: no path separators, no control or quote characters, bounded length. */
export function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return cleaned.length > 0 ? cleaned : "download";
}

export function signFileToken(
  key: string,
  filename: string,
  secret: string | undefined,
  now = Date.now(),
  ttlSeconds = FILE_TOKEN_TTL_SECONDS,
): string {
  assertSecret(secret);
  assertSafeKey(key);
  const payload: FileTokenPayload = { k: key, f: safeFilename(filename), e: Math.floor(now / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret).toString("base64url")}`;
}

/** The payload of a valid, unexpired token, or null. Never throws on hostile input. */
export function verifyFileToken(token: unknown, secret: string | undefined, now = Date.now()): FileTokenPayload | null {
  assertSecret(secret);
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;

  const expected = sign(body, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { k, f, e } = payload as Record<string, unknown>;
  if (typeof k !== "string" || typeof f !== "string" || typeof e !== "number") return null;
  if (e * 1000 <= now) return null;
  try {
    assertSafeKey(k);
  } catch {
    return null;
  }
  return { k, f: safeFilename(f), e };
}
