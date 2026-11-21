/**
 * Send ONE sample mail through Resend (GĐ7.7) to check the key and the sender before going live:
 *
 *   npm run mail:test -- <email> [--locale=vi|en|zh] [--env-file=.env.vercel-production]
 *
 * Reads RESEND_API_KEY and MAIL_FROM from .env.local (or the given file); MAIL_DRIVER may stay `outbox` on the
 * dev machine. A MAIL_FROM on localhost is replaced by Resend's test sender `onboarding@resend.dev`, which only
 * reaches the Resend account's own address until the shop's domain is verified. The mail is the password reset
 * mail with a sample link that does not work. Touches no database; never prints the key.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { ResendTransport } from "../src/mail/resend";
import { renderPasswordReset } from "../src/mail/render";

const LOCALES = ["vi", "en", "zh"] as const;
export const RESEND_TEST_FROM = "Asset Game MMORPG 2D <onboarding@resend.dev>";

/** The sender to use: the configured one, or Resend's test sender when it is still the dev placeholder. */
export function testSender(mailFrom: string | undefined): string {
  return !mailFrom || /@localhost>?\s*$/i.test(mailFrom) ? RESEND_TEST_FROM : mailFrom;
}

async function main() {
  const args = process.argv.slice(2);
  const to = args.find((a) => !a.startsWith("--"));
  const locale = (args.find((a) => a.startsWith("--locale="))?.slice(9) ?? "vi") as (typeof LOCALES)[number];
  const file = args.find((a) => a.startsWith("--env-file="))?.slice(11) ?? ".env.local";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Cách dùng: npm run mail:test -- <email> [--locale=vi|en|zh] [--env-file=<file>]");
  if (!LOCALES.includes(locale)) throw new Error("--locale phải là vi, en hoặc zh.");
  if (!existsSync(file)) throw new Error(`Không có file ${file}.`);
  const env = parse(readFileSync(file));
  if (!env.RESEND_API_KEY?.startsWith("re_")) throw new Error(`${file}: thiếu RESEND_API_KEY (khoá API của Resend, bắt đầu bằng re_).`);
  const from = testSender(env.MAIL_FROM);
  const appUrl = env.APP_URL || "http://localhost:3000";
  const mail = renderPasswordReset(locale, { name: null, email: to, url: `${appUrl}/${locale}/reset-password/MAU-KHONG-DUNG-DUOC`, minutes: 30 });
  console.log(`Gửi thư mẫu (${locale}) từ ${from} tới ${to} qua Resend…`);
  const { id } = await new ResendTransport(env.RESEND_API_KEY).send({ from, to, ...mail, kind: "passwordReset", locale });
  console.log(`✔ Resend đã nhận thư, id ${id}. Xem trong hộp thư (cả mục Spam) và ở resend.com → Emails.`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mail-test.ts")) {
  main().catch((e) => {
    console.error(`✖ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
