import type { MailMessage, MailTransport } from "./types";

export const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Real mail through Resend's HTTP API (GĐ7.7, user choice: Resend). No SDK: one POST per mail. The API key is only
 * in .env.local / the host's settings. Until the sending domain is verified at Resend, only `onboarding@resend.dev`
 * can send, and only to the Resend account's own address. No `server-only` here: unit tests import it directly.
 */
export class ResendTransport implements MailTransport {
  readonly driver = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(message: MailMessage): Promise<{ id: string }> {
    const res = await this.fetchImpl(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [
          { name: "kind", value: message.kind },
          { name: "locale", value: message.locale },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: unknown; message?: unknown; name?: unknown };
    if (!res.ok || typeof body.id !== "string") {
      // Resend's own explanation (wrong key, unverified domain…); never the mail itself, which may hold a reset link.
      const why = typeof body.message === "string" ? body.message : "no id in the answer";
      throw new Error(`Resend ${res.status}${typeof body.name === "string" ? ` ${body.name}` : ""}: ${why}`);
    }
    return { id: body.id };
  }
}
