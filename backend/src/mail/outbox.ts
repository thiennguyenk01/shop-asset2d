import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MailMessage, MailTransport } from "./types";

/**
 * Development-only mail transport (DECISIONS #38): nothing is sent; every mail becomes three files in the outbox
 * folder (default `.mail-outbox/`, outside `public/`, git-ignored): `<id>.html` to open in a browser, `<id>.txt`
 * (the plain-text part) and `<id>.json` (from, to, subject, kind, locale, time). Refused on production by
 * backend/src/env.ts. No `server-only` here: unit tests import it directly.
 */
export class OutboxTransport implements MailTransport {
  readonly driver = "outbox" as const;
  readonly dir: string;

  constructor(dir: string, projectRoot: string = process.cwd()) {
    // `turbopackIgnore`: resolved at runtime (dev only); see backend/src/storage/local.ts.
    this.dir = path.resolve(/*turbopackIgnore: true*/ projectRoot, dir);
    const root = path.resolve(/*turbopackIgnore: true*/ projectRoot);
    const publicDir = path.join(root, "public");
    if (this.dir === publicDir || this.dir.startsWith(publicDir + path.sep)) {
      throw new Error("MAIL_OUTBOX_DIR không được nằm trong thư mục public/ (thư chứa link đặt lại mật khẩu).");
    }
    if (this.dir === root) throw new Error("MAIL_OUTBOX_DIR không được là thư mục gốc của dự án.");
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    // Sortable by time; the random part keeps two mails of the same millisecond apart.
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${message.kind}-${message.locale}-${randomBytes(3).toString("hex")}`;
    await mkdir(this.dir, { recursive: true });
    const file = (ext: string) => path.join(this.dir, `${id}.${ext}`);
    const meta = {
      id,
      from: message.from,
      to: message.to,
      subject: message.subject,
      kind: message.kind,
      locale: message.locale,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([
      writeFile(file("html"), message.html, "utf8"),
      writeFile(file("txt"), message.text, "utf8"),
      writeFile(file("json"), JSON.stringify(meta, null, 2) + "\n", "utf8"),
    ]);
    return { id };
  }
}
