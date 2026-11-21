import type { Locale } from "@backend/i18n/routing";

/** The mails the shop sends. GĐ6 (DECISIONS #38): only the password reset mail. */
export const MAIL_KINDS = ["passwordReset"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

/** A rendered mail, ready for a transport. `kind` + `locale` are kept for logs and the dev outbox. */
export type MailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: MailKind;
  locale: Locale;
};

export interface MailTransport {
  readonly driver: "outbox" | "resend" | "smtp";
  /** Resolves once the mail is handed over (dev: written to disk). `id` identifies it in logs. */
  send(message: MailMessage): Promise<{ id: string }>;
}
