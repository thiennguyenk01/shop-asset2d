/**
 * Preview the shop's mails (GĐ6.1): renders each mail in VI / EN / ZH with SAMPLE data and writes it to the dev
 * outbox (MAIL_OUTBOX_DIR, default `.mail-outbox/`) exactly as the app would. Open the printed .html files in a
 * browser. Nothing is sent and nothing touches the database.
 *
 *   npm run mail:preview
 */
import { config as loadEnv } from "dotenv";
import { parseEnv } from "../src/env";
import { OutboxTransport } from "../src/mail/outbox";
import { renderPasswordReset } from "../src/mail/render";

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const env = parseEnv(process.env);
  if (env.MAIL_DRIVER !== "outbox") throw new Error("mail:preview chỉ ghi vào outbox ở dev (MAIL_DRIVER=outbox).");
  const outbox = new OutboxTransport(env.MAIL_OUTBOX_DIR);
  const samples = [
    { locale: "vi", name: "Lý Tiêu Dao", email: "khach-mau@example.test" },
    { locale: "en", name: "Li Xiaoyao", email: "sample-customer@example.test" },
    { locale: "zh", name: "李逍遥", email: "sample-customer@example.test" },
  ] as const;
  for (const s of samples) {
    // A sample link: the token is fake and the page arrives with step 6.2.
    const url = `${env.APP_URL}/${s.locale}/reset-password/MAU-KHONG-DUNG-DUOC`;
    const mail = renderPasswordReset(s.locale, { name: s.name, email: s.email, url, minutes: 30 });
    const { id } = await outbox.send({
      from: env.MAIL_FROM,
      to: s.email,
      ...mail,
      kind: "passwordReset",
      locale: s.locale,
    });
    console.log(`${s.locale}: ${outbox.dir}${process.platform === "win32" ? "\\" : "/"}${id}.html`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
