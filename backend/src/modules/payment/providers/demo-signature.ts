import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature of the Demo provider's webhook (CLAUDE.md §6: the demo goes through the SAME signed webhook path
 * as a real gateway). Header `x-demo-signature: t=<unix seconds>,v1=<hex HMAC-SHA256("<t>.<raw body>")>`.
 * The key is derived from AUTH_SECRET with a purpose label. Events older than 5 minutes are refused.
 * No `server-only`: imported by unit tests and by the E2E tests that replay / forge webhooks.
 */
export const DEMO_SIGNATURE_HEADER = "x-demo-signature";
export const DEMO_SIGNATURE_TOLERANCE_SECONDS = 300;
const PURPOSE = "asset-game/demo-webhook/v1";

function key(secret: string | undefined): Buffer {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET là bắt buộc để ký webhook Demo.");
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

const mac = (secret: string | undefined, t: number, body: string) => createHmac("sha256", key(secret)).update(`${t}.${body}`).digest("hex");

export function signDemoWebhook(body: string, secret: string | undefined, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${mac(secret, t, body)}`;
}

export function verifyDemoWebhook(body: string, header: string | null, secret: string | undefined, now = Date.now()): boolean {
  if (!header || header.length > 256) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : ["", ""];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isSafeInteger(t) || typeof v1 !== "string" || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(Math.floor(now / 1000) - t) > DEMO_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(mac(secret, t, body), "hex");
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}
