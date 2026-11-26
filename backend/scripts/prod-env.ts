/**
 * The live site's settings, checked BEFORE they are pasted into Vercel's Production environment (GĐ7.7 preparation).
 * They live in `.env.vercel-production`, filled in by the user (never in chat, never committed — .gitignore covers
 * `.env*`). Not named `.env.production`: Next loads that file by itself in `next build`, which would mix the
 * production keys into a local build.
 *
 *   npm run prod:init     write the template (random AUTH_SECRET / CRON_SECRET; refuses to overwrite)
 *   npm run prod:check    list every problem: the app's own production rules (backend/src/env.ts: no Demo, no
 *                         r2.dev, a real mail service with its key…), the production database, separate buckets
 *                         and secrets…
 *   npm run prod:check -- --storage   also run `storage:check` against the production buckets (writes and removes
 *                         a tiny test object in each bucket; nothing else)
 *
 * Reads only; never touches the database. Prints host and bucket names, never a key or a connection string.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { parseEnv } from "../src/env";
import { hostOf, isNeonPooledHost } from "./db-guard";

export const PROD_VERCEL_ENV_FILE = ".env.vercel-production";

const normalize = (h?: string) => h?.replace(/-pooler(?=\.)/, "");

/** Filled in by the user before going live (payment-provider keys are checked by the app's own rules). */
export const PROD_REQUIRED = [
  "APP_URL",
  "DATABASE_URL",
  "PRODUCTION_DATABASE_HOSTS",
  "AUTH_SECRET",
  "CRON_SECRET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_PRIVATE_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "MAIL_DRIVER",
  "MAIL_FROM",
] as const;

/**
 * The errors parseEnv throws, one readable line each: its own production rules ("- …" lines) and the schema's
 * ("✖ message" followed by "→ at KEY", shown as "KEY: message").
 */
export function readableEnvErrors(message: string): string[] {
  const out: string[] = [];
  const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("✖")) {
      const at = lines[i + 1]?.match(/^→ at (.+)$/);
      out.push(at ? `${at[1]}: ${line.slice(1).trim()}` : line.slice(1).trim());
      if (at) i++;
    } else if (line.startsWith("- ")) out.push(line.slice(2));
    else if (!line.endsWith(":")) out.push(line);
  }
  return out;
}

/**
 * Problems with the live site's settings (pure; unit-tested). `others` are the dev and preview files: the live
 * site must not share their database, buckets or secrets.
 */
export function checkProductionEnv(prod: Record<string, string>, others: Record<string, string>[]): string[] {
  const problems: string[] = [];
  const file = PROD_VERCEL_ENV_FILE;

  // 0. Values the live site must be given (an empty line in the template is "not filled in yet").
  const missing = PROD_REQUIRED.filter((key) => !prod[key]?.trim());
  for (const key of missing) problems.push(`${file}: thiếu ${key}.`);
  const filled = Object.fromEntries(Object.entries(prod).filter(([, v]) => v.trim() !== ""));

  // 1. The app's own rules, exactly as on Vercel (VERCEL_ENV=production always means production). A rule about a
  // value already reported as missing is not repeated.
  try {
    parseEnv({ ...filled, VERCEL_ENV: "production" });
  } catch (e) {
    const subject = (line: string) => line.split(/[\s=:]/)[0];
    problems.push(...readableEnvErrors(e instanceof Error ? e.message : String(e)).filter((l) => !(missing as string[]).includes(subject(l))));
  }

  // 2. The production database, through its pooled connection.
  const dbHost = hostOf(prod.DATABASE_URL);
  const prodHosts = (prod.PRODUCTION_DATABASE_HOSTS ?? "").split(",").map((h) => normalize(h.trim().toLowerCase())).filter(Boolean);
  if (prod.DATABASE_URL && !isNeonPooledHost(dbHost)) problems.push(`${file}: DATABASE_URL phải là kết nối pooled (host -pooler) của nhánh production.`);
  if (prod.DATABASE_URL && !prodHosts.includes(normalize(dbHost))) {
    problems.push(`${file}: DATABASE_URL (${dbHost}) không nằm trong PRODUCTION_DATABASE_HOSTS: phải là nhánh production của Neon.`);
  }
  if (prod.DIRECT_URL) problems.push(`${file}: bỏ DIRECT_URL. Web chạy thật không cần nó; kết nối direct của production chỉ nằm trong .env.production-db lúc chạy db:prod:*.`);

  // 3. The address customers use.
  if (prod.APP_URL && /-git-[a-z0-9-]+\.vercel\.app/i.test(prod.APP_URL)) {
    problems.push(`${file}: APP_URL đang là địa chỉ của bản thử (…-git-…vercel.app): dùng địa chỉ của web thật.`);
  }

  // 4. Nothing shared with dev / the preview.
  for (const other of others) {
    for (const host of [hostOf(other.DATABASE_URL), hostOf(other.DIRECT_URL)]) {
      if (host && normalize(host) === normalize(dbHost)) problems.push(`${file}: DATABASE_URL trùng database của dev / bản thử.`);
    }
    for (const key of ["R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"] as const) {
      if (prod[key] && [other.R2_PUBLIC_BUCKET, other.R2_PRIVATE_BUCKET].includes(prod[key])) {
        problems.push(`${file}: ${key} (${prod[key]}) đang là bucket của dev / bản thử: web thật dùng 2 bucket riêng.`);
      }
    }
    for (const key of ["AUTH_SECRET", "CRON_SECRET", "R2_ACCESS_KEY_ID"] as const) {
      if (prod[key] && other[key] === prod[key]) problems.push(`${file}: ${key} trùng với dev / bản thử: tạo giá trị riêng cho web thật.`);
    }
  }
  return [...new Set(problems)];
}

/** The template written by `prod:init`: random secrets, the values the live site must have, the rest empty. */
export function productionTemplate(local: Record<string, string>): string {
  const secret = () => randomBytes(32).toString("base64url");
  return [
    "# Web chạy thật (production, bước 7.7). Điền các dòng còn trống (không gửi file này qua chat, không commit),",
    "# kiểm bằng `npm run prod:check`, rồi dán nội dung vào Vercel → Settings → Environment Variables, CHỈ chọn Production.",
    "# Địa chỉ web thật (tên miền asset2d.id.vn, DECISIONS #55)",
    "APP_URL=https://asset2d.id.vn",
    "# Nhánh production của Neon, kết nối pooled (host có -pooler)",
    "DATABASE_URL=",
    `PRODUCTION_DATABASE_HOSTS=${local.PRODUCTION_DATABASE_HOSTS ?? ""}`,
    "# Tạo ngẫu nhiên, riêng cho web thật",
    `AUTH_SECRET=${secret()}`,
    `CRON_SECRET=${secret()}`,
    "# Thanh toán thật: sepay (SEPAY_MODE=live)",
    "PAYMENT_PROVIDER=sepay",
    "SEPAY_MODE=live",
    "SEPAY_WEBHOOK_SECRET=",
    "SEPAY_BANK_ACCOUNT=",
    "SEPAY_BANK_NAME=",
    "SEPAY_ACCOUNT_NAME=",
    "# R2: 2 bucket + token riêng của web thật; ảnh qua tên miền riêng (không dùng r2.dev)",
    "STORAGE_DRIVER=r2",
    `R2_ACCOUNT_ID=${local.R2_ACCOUNT_ID ?? ""}`,
    "R2_ACCESS_KEY_ID=",
    "R2_SECRET_ACCESS_KEY=",
    "R2_PUBLIC_BUCKET=asset-game-prod-public",
    "R2_PRIVATE_BUCKET=asset-game-prod-private",
    "R2_PUBLIC_BASE_URL=https://media.asset2d.id.vn",
    "# Email thật qua Resend: khoá API (re_…) và người gửi thuộc tên miền đã xác minh ở Resend",
    "MAIL_DRIVER=resend",
    "MAIL_FROM=Asset Game MMORPG 2D <no-reply@asset2d.id.vn>",
    "RESEND_API_KEY=",
    "# Đăng nhập Google (tuỳ chọn, DECISIONS #63): client của web thật, redirect URI <APP_URL>/api/auth/callback/google; trống cả hai = không có nút Google",
    "AUTH_GOOGLE_ID=",
    "AUTH_GOOGLE_SECRET=",
    "",
  ].join("\n");
}

const readEnvFile = (file: string): Record<string, string> => (existsSync(file) ? parse(readFileSync(file)) : {});

function main() {
  const [command, ...flags] = process.argv.slice(2);
  const local = readEnvFile(".env.local");
  if (command === "init") {
    if (existsSync(PROD_VERCEL_ENV_FILE)) {
      console.error(`✖ ${PROD_VERCEL_ENV_FILE} đã có — không ghi đè. Xoá file đó nếu muốn tạo lại.`);
      process.exit(1);
    }
    writeFileSync(PROD_VERCEL_ENV_FILE, productionTemplate(local));
    console.log(`✔ Đã tạo ${PROD_VERCEL_ENV_FILE}. Điền các dòng còn trống rồi chạy npm run prod:check.`);
    return;
  }
  if (command !== "check") {
    console.error("Cách dùng: npm run prod:init | prod:check [-- --storage]");
    process.exit(2);
  }
  const prod = readEnvFile(PROD_VERCEL_ENV_FILE);
  if (Object.keys(prod).length === 0) {
    console.error(`✖ Chưa có ${PROD_VERCEL_ENV_FILE}: chạy npm run prod:init trước.`);
    process.exit(1);
  }
  console.log(`Web thật: ${prod.APP_URL || "(chưa có APP_URL)"} · database ${hostOf(prod.DATABASE_URL) ?? "—"} · bucket ${prod.R2_PUBLIC_BUCKET || "—"} / ${prod.R2_PRIVATE_BUCKET || "—"}`);
  const problems = checkProductionEnv(prod, [local, readEnvFile(".env.preview")]);
  for (const p of problems) console.log(`✖ ${p}`);
  if (problems.length > 0) {
    console.log(`\n${problems.length} việc cần làm trước khi chạy thật.`);
    process.exit(1);
  }
  console.log("✔ Cấu hình web thật đạt mọi quy tắc.");
  if (flags.includes("--storage")) {
    // storage:check reads .env.local; values already set here win (dotenv never overrides).
    const tsx = path.join("node_modules", "tsx", "dist", "cli.mjs");
    const r = spawnSync(process.execPath, [tsx, path.join("backend", "scripts", "storage-check.ts")], { stdio: "inherit", env: { ...process.env, ...prod } });
    process.exit(r.status ?? 1);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/prod-env.ts")) {
  main();
}
