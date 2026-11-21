import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import en from "../../../frontend/messages/en.json" with { type: "json" };
import vi from "../../../frontend/messages/vi.json" with { type: "json" };
import zh from "../../../frontend/messages/zh.json" with { type: "json" };
import { OutboxTransport } from "@backend/mail/outbox";
import { esc, renderPasswordReset } from "@backend/mail/render";

/** GĐ6.1 — the shared mail layer: password reset mail in the customer's language, and the dev outbox. */
const URL = "http://localhost:3000/vi/reset-password/abc123";
const sample = { name: "Lý Tiêu Dao", email: "khach@example.test", url: URL, minutes: 30 };

describe("password reset mail (GĐ6.1)", () => {
  it("is written in the customer's language, from the message files", () => {
    const all = { vi, en, zh } as const;
    for (const locale of ["vi", "en", "zh"] as const) {
      const m = renderPasswordReset(locale, sample);
      const e = all[locale].email.passwordReset;
      expect(m.subject).toBe(e.subject.replace("{brand}", "Asset Game MMORPG 2D"));
      expect(m.html).toContain(`<html lang="${locale === "zh" ? "zh-CN" : locale}">`);
      expect(m.html).toContain(esc(e.button));
      expect(m.html).toContain(esc(e.expiry.replace("{minutes}", "30")));
      expect(m.text).toContain(e.ignore);
      // No placeholder left behind, the link is there in both parts.
      expect(m.html + m.text).not.toMatch(/\{[a-z]+\}/);
      expect(m.html).toContain(`href="${URL}"`);
      expect(m.text).toContain(URL);
    }
    expect(renderPasswordReset("vi", sample).text).toContain("Chào Lý Tiêu Dao,");
    expect(renderPasswordReset("zh", { ...sample, name: "李逍遥" }).text).toContain("李逍遥，您好：");
  });

  it("greets without a name when the account has none", () => {
    expect(renderPasswordReset("en", { ...sample, name: null }).text).toContain(en.email.passwordReset.greetingNoName);
    expect(renderPasswordReset("vi", { ...sample, name: "   " }).text).toContain(vi.email.passwordReset.greetingNoName);
  });

  it("keeps every style attribute intact (no double quote inside style values)", () => {
    const html = renderPasswordReset("vi", sample).html;
    const styles = [...html.matchAll(/style="([^"]*)"(.)/g)];
    expect(styles.length).toBeGreaterThan(10);
    // After a style value comes the end of the tag or another attribute — never a stray piece of a font name.
    for (const [, value, next] of styles) expect(next, value).toMatch(/[>\s]/);
    expect(html).toContain("font-family:-apple-system, 'Segoe UI'");
  });

  it("escapes every value put into the HTML", () => {
    const m = renderPasswordReset("en", { ...sample, name: `<script>alert(1)</script>`, email: `a"b@example.test` });
    expect(m.html).not.toContain("<script>alert(1)</script>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(m.html).toContain("a&quot;b@example.test");
  });

  it("refuses a link that is not an absolute http(s) URL", () => {
    for (const url of ["javascript:alert(1)", "/vi/reset-password/x", "data:text/html,x", ""]) {
      expect(() => renderPasswordReset("vi", { ...sample, url }), url).toThrow();
    }
  });
});

describe("dev outbox (GĐ6.1)", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes the HTML, the text part and the details of each mail as files; sends nothing", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "outbox-"));
    const outbox = new OutboxTransport(path.join(dir, "out"), dir);
    const mail = renderPasswordReset("vi", sample);
    const { id } = await outbox.send({
      from: "Shop <no-reply@localhost>",
      to: sample.email,
      ...mail,
      kind: "passwordReset",
      locale: "vi",
    });
    const files = (await readdir(path.join(dir, "out"))).sort();
    expect(files).toEqual([`${id}.html`, `${id}.json`, `${id}.txt`]);
    expect(await readFile(path.join(dir, "out", `${id}.html`), "utf8")).toBe(mail.html);
    expect(JSON.parse(await readFile(path.join(dir, "out", `${id}.json`), "utf8"))).toMatchObject({
      to: sample.email,
      subject: mail.subject,
      kind: "passwordReset",
      locale: "vi",
    });
  });

  it("never lives under public/ (the mails hold reset links) nor at the project root", () => {
    expect(() => new OutboxTransport("public/mail", "/proj")).toThrow(/public/);
    expect(() => new OutboxTransport("public", "/proj")).toThrow(/public/);
    expect(() => new OutboxTransport(".", "/proj")).toThrow();
    expect(() => new OutboxTransport(".mail-outbox", "/proj")).not.toThrow();
  });
});
