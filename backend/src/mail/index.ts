import "server-only";
import type { Locale } from "@backend/i18n/routing";
import { getEnv } from "@backend/env";
import { OutboxTransport } from "./outbox";
import { ResendTransport } from "./resend";
import { renderPasswordReset, type PasswordResetMail } from "./render";
import type { MailTransport } from "./types";

/**
 * Shared mail layer (GĐ6.1, DECISIONS #38). Callers (services) pick a mail, the customer's language and the
 * recipient; this module renders it from `frontend/messages/<locale>.json` and hands it to the transport:
 * - outbox (dev, default): written as files to MAIL_OUTBOX_DIR (`.mail-outbox/`), never sent;
 * - resend: the real service (GĐ7.7, user choice), through Resend's HTTP API. `smtp` is reserved, not implemented.
 *   Production refuses the outbox at startup (backend/src/env.ts).
 */
let instance: MailTransport | undefined;

export function getMailTransport(): MailTransport {
  if (instance) return instance;
  const env = getEnv();
  if (env.MAIL_DRIVER === "outbox") {
    instance = new OutboxTransport(env.MAIL_OUTBOX_DIR);
    return instance;
  }
  if (env.MAIL_DRIVER === "resend") {
    // parseEnv refuses resend without a key.
    instance = new ResendTransport(env.RESEND_API_KEY!);
    return instance;
  }
  throw new Error(`MAIL_DRIVER=${env.MAIL_DRIVER} chưa được triển khai.`);
}

/** The only mail of GĐ6: the password reset link (used by step 6.2). */
export async function sendPasswordResetMail(
  to: string,
  locale: Locale,
  p: Omit<PasswordResetMail, "email">,
): Promise<{ id: string }> {
  const mail = renderPasswordReset(locale, { ...p, email: to });
  const transport = getMailTransport();
  const sent = await transport.send({ from: getEnv().MAIL_FROM, to, ...mail, kind: "passwordReset", locale });
  // Never log the link itself: it is a password reset token.
  if (transport.driver === "outbox")
    console.info(`[mail] passwordReset (${locale}) → ${getEnv().MAIL_OUTBOX_DIR}/${sent.id}.html`);
  else console.info(`[mail] passwordReset (${locale}) sent by ${transport.driver}, id ${sent.id}`);
  return sent;
}
