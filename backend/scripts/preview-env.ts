/**
 * The Vercel preview environment (GĐ7.6; user choices 2026-11-21: GitHub + Vercel, open to anyone with the link, a
 * clean database with the 10 demo packs). Runs the existing commands against the preview's own Neon branch and R2
 * buckets, described in `.env.preview` (filled in by the user; the same lines are pasted into Vercel's Preview
 * environment variables; never in chat, never committed — .gitignore covers `.env*`).
 *
 *   npm run preview:init            write a `.env.preview` template (random AUTH_SECRET / CRON_SECRET; refuses to overwrite)
 *   npm run preview:setup           apply the migrations (`prisma migrate deploy`), then the full seed (reference
 *                                   data, 10 demo packs + their demo pictures/files in the preview buckets, demo coupons)
 *   npm run preview:check           `storage:check` against the preview buckets (CORS checked for the preview APP_URL)
 *   npm run preview:grant -- <email> / preview:revoke -- <email>   make an account registered on the preview an Admin
 *
 * Safety: the same guard as `db:*` (never production: APP_ENV, PRODUCTION_DATABASE_HOSTS), and the preview database
 * must not be the dev branch of `.env.local` (the seed recreates every demo pack). Never `migrate dev` / `reset`.
 * Prints host names only, never a password, key or connection string.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { checkDbGuard, hostOf, isNeonPooledHost } from "./db-guard";

export const PREVIEW_ENV_FILE = ".env.preview";

/** Filled in by the user (empty in the template). */
export const PREVIEW_REQUIRED = [
  "APP_URL",
  "DATABASE_URL",
  "DIRECT_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_PRIVATE_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "AUTH_SECRET",
] as const;

/** Always the same on the preview: Demo payments only, files on R2, mails written to a throwaway folder. */
export const PREVIEW_FIXED = {
  APP_ENV: "preview",
  PAYMENT_PROVIDER: "demo",
  STORAGE_DRIVER: "r2",
  MAIL_DRIVER: "outbox",
  MAIL_OUTBOX_DIR: "/tmp/mail-outbox",
} as const;

const sameEndpoint = (a?: string, b?: string) => !!a && !!b && a.replace(/-pooler(?=\.)/, "") === b.replace(/-pooler(?=\.)/, "");

/**
 * Problems with a preview env (pure; unit-tested). `local` is .env.local: its PRODUCTION_DATABASE_HOSTS is used when
 * the preview file has none, and its dev database must not be the target.
 */
export function checkPreviewEnv(preview: Record<string, string>, local: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const key of PREVIEW_REQUIRED) if (!preview[key]?.trim()) problems.push(`${PREVIEW_ENV_FILE}: thiếu ${key}.`);
  for (const [key, value] of Object.entries(PREVIEW_FIXED)) {
    if (key !== "APP_ENV" && preview[key] && preview[key] !== value) problems.push(`${PREVIEW_ENV_FILE}: ${key} phải là ${value} trên bản thử.`);
  }
  if (preview.APP_URL && !/^https:\/\//.test(preview.APP_URL)) problems.push(`${PREVIEW_ENV_FILE}: APP_URL phải là địa chỉ https:// của bản thử trên Vercel.`);
  const merged = { ...preview, ...PREVIEW_FIXED, PRODUCTION_DATABASE_HOSTS: preview.PRODUCTION_DATABASE_HOSTS || local.PRODUCTION_DATABASE_HOSTS };
  problems.push(...checkDbGuard("migrate", merged), ...checkDbGuard("seed", merged));
  if (preview.DATABASE_URL && !isNeonPooledHost(hostOf(preview.DATABASE_URL))) {
    problems.push(`${PREVIEW_ENV_FILE}: DATABASE_URL phải là kết nối pooled (host -pooler) — Vercel dùng chuỗi này lúc chạy.`);
  }
  for (const devHost of [hostOf(local.DATABASE_URL), hostOf(local.DIRECT_URL)]) {
    for (const host of [hostOf(preview.DATABASE_URL), hostOf(preview.DIRECT_URL)]) {
      if (sameEndpoint(host, devHost)) problems.push(`Database của bản thử (${host}) đang trùng nhánh dev trong .env.local: tạo nhánh Neon riêng cho bản thử.`);
    }
  }
  for (const key of ["R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"] as const) {
    if (preview[key] && [local.R2_PUBLIC_BUCKET, local.R2_PRIVATE_BUCKET].includes(preview[key])) {
      problems.push(`${PREVIEW_ENV_FILE}: ${key} (${preview[key]}) đang là bucket của dev: bản thử dùng 2 bucket riêng.`);
    }
  }
  return [...new Set(problems)];
}

/** The template written by `preview:init`: random secrets, the fixed values, everything else empty. */
export function previewTemplate(local: Record<string, string>): string {
  const secret = () => randomBytes(32).toString("base64url");
  return [
    "# Bản thử trên Vercel (bước 7.6). Điền các dòng còn trống (không gửi file này qua chat, không commit).",
    "# Sau đó dán TOÀN BỘ nội dung file vào Vercel → Settings → Environment Variables, chọn môi trường Preview.",
    "# Địa chỉ cố định của bản thử: https://<tên project>-git-main-<tên tài khoản>.vercel.app",
    "APP_URL=",
    "# Nhánh Neon riêng của bản thử: pooled (host có -pooler) và direct (không -pooler)",
    "DATABASE_URL=",
    "DIRECT_URL=",
    "# R2: 2 bucket riêng của bản thử + token chỉ cho 2 bucket đó",
    `R2_ACCOUNT_ID=${local.R2_ACCOUNT_ID ?? ""}`,
    "R2_ACCESS_KEY_ID=",
    "R2_SECRET_ACCESS_KEY=",
    "R2_PUBLIC_BUCKET=asset-game-preview-public",
    "R2_PRIVATE_BUCKET=asset-game-preview-private",
    "R2_PUBLIC_BASE_URL=",
    "# Tạo ngẫu nhiên, riêng cho bản thử",
    `AUTH_SECRET=${secret()}`,
    `CRON_SECRET=${secret()}`,
    "# Cố định trên bản thử",
    `PAYMENT_PROVIDER=${PREVIEW_FIXED.PAYMENT_PROVIDER}`,
    `STORAGE_DRIVER=${PREVIEW_FIXED.STORAGE_DRIVER}`,
    `MAIL_DRIVER=${PREVIEW_FIXED.MAIL_DRIVER}`,
    `MAIL_OUTBOX_DIR=${PREVIEW_FIXED.MAIL_OUTBOX_DIR}`,
    `PRODUCTION_DATABASE_HOSTS=${local.PRODUCTION_DATABASE_HOSTS ?? ""}`,
    "",
  ].join("\n");
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const readEnvFile = (file: string): Record<string, string> => (existsSync(file) ? parse(readFileSync(file)) : {});

/** Runs a command of the project with the preview values; dotenv in the child never overrides a variable already set. */
function run(args: string[], env: NodeJS.ProcessEnv): number {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", env });
  return r.status ?? 1;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const local = readEnvFile(".env.local");

  if (command === "init") {
    if (existsSync(PREVIEW_ENV_FILE)) fail(`${PREVIEW_ENV_FILE} đã có — không ghi đè. Xoá file đó nếu muốn tạo lại.`);
    writeFileSync(PREVIEW_ENV_FILE, previewTemplate(local));
    console.log(`✔ Đã tạo ${PREVIEW_ENV_FILE}: điền APP_URL, DATABASE_URL, DIRECT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL.`);
    return;
  }

  const preview = readEnvFile(PREVIEW_ENV_FILE);
  if (Object.keys(preview).length === 0) fail(`Chưa có ${PREVIEW_ENV_FILE}: chạy npm run preview:init trước.`);
  const problems = checkPreviewEnv(preview, local);
  if (problems.length > 0) fail(`Bản thử chưa sẵn sàng:\n- ${problems.join("\n- ")}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...preview,
    ...PREVIEW_FIXED,
    PRODUCTION_DATABASE_HOSTS: preview.PRODUCTION_DATABASE_HOSTS || local.PRODUCTION_DATABASE_HOSTS || "",
  };
  const prisma = path.join("node_modules", "prisma", "build", "index.js");
  const tsx = path.join("node_modules", "tsx", "dist", "cli.mjs");
  const config = ["--config", path.join("backend", "prisma.config.ts")];
  console.log(`Bản thử: database ${hostOf(preview.DIRECT_URL)}, bucket ${preview.R2_PUBLIC_BUCKET} / ${preview.R2_PRIVATE_BUCKET}, ${preview.APP_URL}`);

  let status = 0;
  if (command === "setup") {
    status = run([prisma, "migrate", "deploy", ...config], env);
    if (status === 0) status = run([prisma, "db", "seed", ...config], env);
  } else if (command === "check") {
    status = run([tsx, path.join("backend", "scripts", "storage-check.ts")], env);
  } else if (command === "grant" || command === "revoke") {
    if (!rest[0]) fail(`Cách dùng: npm run preview:${command} -- <email>`);
    status = run([tsx, path.join("backend", "scripts", "admin-grant.ts"), command, rest[0]], env);
  } else {
    fail("Cách dùng: tsx backend/scripts/preview-env.ts <init|setup|check|grant|revoke> [email]");
  }
  process.exit(status);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/preview-env.ts")) {
  main();
}
