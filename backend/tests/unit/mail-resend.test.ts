import { describe, expect, it } from "vitest";
import { RESEND_API_URL, ResendTransport } from "@backend/mail/resend";
import type { MailMessage } from "@backend/mail/types";
import { RESEND_TEST_FROM, testSender } from "../../scripts/mail-test";

/** GĐ7.7 — real mail through Resend's HTTP API (no network: fetch is replaced). */
const message: MailMessage = {
  from: "Shop <no-reply@shop.example.com>",
  to: "khach@example.test",
  subject: "Đặt lại mật khẩu",
  html: "<p>link</p>",
  text: "link",
  kind: "passwordReset",
  locale: "vi",
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("Resend transport", () => {
  it("posts one mail with the key as a bearer token and returns Resend's id", async () => {
    const f = fakeFetch(200, { id: "abc-123" });
    const sent = await new ResendTransport("re_key", f.impl).send(message);
    expect(sent).toEqual({ id: "abc-123" });
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe(RESEND_API_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });

  it("fails with Resend's explanation, never the key or the mail body", async () => {
    const f = fakeFetch(403, { statusCode: 403, name: "validation_error", message: "The domain is not verified." });
    const err = await new ResendTransport("re_secret", f.impl).send(message).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend 403 validation_error: The domain is not verified.");
    expect((err as Error).message).not.toMatch(/re_secret|link/);
  });

  it("an answer without an id is a failure", async () => {
    await expect(new ResendTransport("re_k", fakeFetch(200, {}).impl).send(message)).rejects.toThrow(/Resend 200/);
  });
});

describe("mail:test sender", () => {
  it("uses Resend's test sender while MAIL_FROM is still the dev placeholder", () => {
    expect(testSender(undefined)).toBe(RESEND_TEST_FROM);
    expect(testSender("Asset Game MMORPG 2D <no-reply@localhost>")).toBe(RESEND_TEST_FROM);
    expect(testSender("Shop <no-reply@asset2d.id.vn>")).toBe("Shop <no-reply@asset2d.id.vn>");
  });
});
