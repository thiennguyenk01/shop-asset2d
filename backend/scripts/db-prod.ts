/**
 * Production database commands (GĐ7.4; user choice 2026-11-20: a manual command with confirmation, and a
 * separate command that writes reference data only). The ONLY way to change the production database.
 *
 *   npm run db:prod:status                         read only: applied / pending / failed migrations
 *   npm run db:prod:migrate [-- --allow-destructive]  apply pending migrations (`prisma migrate deploy`)
 *   npm run db:prod:reference                      upsert categories, genres, styles, "Lợi ích" rows
 *   npm run db:prod:grant -- <email>               make an account registered on the live site an Admin (GĐ7.7)
 *   npm run db:prod:revoke -- <email>              take Admin away (also signs out every session of that account)
 *
 * - Reads the connection string ONLY from `.env.production-db` (DIRECT_URL, filled in by the user; never in
 *   chat, never committed — .gitignore covers `.env*`). `.env.local` is read for nothing but
 *   PRODUCTION_DATABASE_HOSTS. `--env-file=<path>` points to another file (used to rehearse on a dev branch).
 * - The target must be listed in PRODUCTION_DATABASE_HOSTS, direct (not -pooler), with sslmode=require.
 * - migrate / reference / grant / revoke ask the user to type the Neon endpoint id ("ep-…") before writing anything.
 * - Never `migrate dev`, never `migrate reset`, never the demo seed (no demo packs, no test coupons, no files).
 * Rules: backend/scripts/db-prod-rules.ts. Procedure: docs/OPERATIONS.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parse } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { upsertReferenceData, REFERENCE_COUNTS } from "../prisma/seed/reference";
import { applyAdminRole, planAdminRole } from "./admin-role";
import { checkProdTarget, confirmationMatches, endpointId, planMigration, PROD_ENV_FILE, type MigrationRow } from "./db-prod-rules";

type Command = "status" | "migrate" | "reference" | "grant" | "revoke";
const COMMANDS: readonly Command[] = ["status", "migrate", "reference", "grant", "revoke"];
const MIGRATIONS_DIR = "backend/prisma/migrations";

function fail(message: string, code = 1): never {
  console.error(`✖ ${message}`);
  process.exit(code);
}

function readEnvFile(file: string): Record<string, string> {
  return existsSync(file) ? parse(readFileSync(file)) : {};
}

function migrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, e.name, "migration.sql")))
    .map((e) => e.name)
    .sort();
}

const sqlOf = (folder: string) => readFileSync(path.join(MIGRATIONS_DIR, folder, "migration.sql"), "utf8");

async function readState(db: PrismaClient): Promise<{ history: MigrationRow[] | null; otherTables: number }> {
  const [{ exists }] = await db.$queryRaw<{ exists: boolean }[]>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`;
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
  if (!exists) return { history: null, otherTables: count };
  const history = await db.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
  return { history, otherTables: count };
}

/**
 * Runs the Prisma CLI against `directUrl`. prisma.config.ts reads DIRECT_URL; dotenv never overrides a variable
 * that is already set, so the URL given here wins over the one in .env.local. Prisma prints the host it uses.
 */
function prismaCli(args: string[], directUrl: string): number {
  // The project's own Prisma CLI, run with this Node (no shell: the arguments are passed as they are).
  const cli = path.join("node_modules", "prisma", "build", "index.js");
  // The config lives in backend/ (the commands run from the repository root).
  const run = spawnSync(process.execPath, [cli, ...args, "--config", path.join("backend", "prisma.config.ts")], { stdio: "inherit", env: { ...process.env, DIRECT_URL: directUrl } });
  return run.status ?? 1;
}

async function confirm(host: string, what: string): Promise<void> {
  const id = endpointId(host);
  console.log(`\n⚠ ${what} trên database PRODUCTION (${host}).`);
  console.log("  Nên tạo nhánh sao lưu trước: Neon Console → Branches → Create branch (từ nhánh production).");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`  Gõ đúng "${id}" để tiếp tục (gõ khác để huỷ): `);
  rl.close();
  if (!confirmationMatches(typed, host)) fail("Đã huỷ: chuỗi xác nhận không khớp. Không có gì thay đổi.", 3);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] as Command | undefined;
  if (!command || !COMMANDS.includes(command)) {
    fail("Cách dùng: npm run db:prod:status | db:prod:migrate [-- --allow-destructive] | db:prod:reference | db:prod:grant -- <email> | db:prod:revoke -- <email>", 2);
  }
  const email = args.slice(1).find((a) => !a.startsWith("--"));
  if ((command === "grant" || command === "revoke") && !email) fail(`Cách dùng: npm run db:prod:${command} -- <email>`, 2);
  const envFile = args.find((a) => a.startsWith("--env-file="))?.slice("--env-file=".length) ?? PROD_ENV_FILE;
  if (!existsSync(envFile)) fail(`Không có file ${envFile}. Tạo file đó và tự điền DIRECT_URL của nhánh production (xem docs/OPERATIONS.md).`);
  const prodEnv = readEnvFile(envFile);
  const localEnv = readEnvFile(".env.local");
  const target = {
    DIRECT_URL: prodEnv.DIRECT_URL,
    PRODUCTION_DATABASE_HOSTS: prodEnv.PRODUCTION_DATABASE_HOSTS ?? localEnv.PRODUCTION_DATABASE_HOSTS,
  };
  const { host, problems } = checkProdTarget(target);
  if (problems.length > 0 || !host) fail(`db-prod từ chối:\n- ${problems.join("\n- ")}`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.DIRECT_URL! }) });
  try {
    console.log(`Database: ${host}`);
    const state = await readState(db);
    const folders = migrationFolders();
    const plan = planMigration({ folders, ...state, sqlOf, allowDestructive: args.includes("--allow-destructive") });
    const applied = (state.history ?? []).filter((r) => r.finished_at).length;
    console.log(`Migration: đã áp ${applied}/${folders.length}; chờ áp ${plan.pending.length}${plan.pending.length ? ": " + plan.pending.join(", ") : ""}.`);
    for (const n of plan.notes) console.log(`  • ${n}`);
    for (const b of plan.blockers) console.log(`  ✖ ${b}`);

    if (command === "status") {
      // Prisma's own view, through the same path `migrate` uses (proves which database the CLI talks to).
      console.log("\nprisma migrate status:");
      prismaCli(["migrate", "status"], target.DIRECT_URL!);
      return;
    }

    if (command === "migrate") {
      if (plan.blockers.length > 0) fail("Không áp migration nào (xem các dòng ✖ ở trên).");
      if (plan.pending.length === 0) return void console.log("✔ Không có migration nào chờ áp.");
      await confirm(host, `Áp ${plan.pending.length} migration`);
      await db.$disconnect();
      if (prismaCli(["migrate", "deploy"], target.DIRECT_URL!) !== 0) {
        fail("prisma migrate deploy báo lỗi (xem ở trên). Chạy lại db:prod:status để xem trạng thái.");
      }
      console.log("✔ Đã áp migration. Kiểm tra lại: npm run db:prod:status");
      return;
    }

    if (plan.pending.length > 0 || plan.blockers.length > 0) fail("Database chưa ở migration mới nhất: chạy db:prod:migrate trước.");

    if (command === "grant" || command === "revoke") {
      // Read first (no write), then the typed confirmation, then the one update.
      const role = await planAdminRole(db, email!, command);
      if (role.kind === "error") fail(role.message);
      if (role.kind === "noop") return void console.log(`• ${role.message}`);
      await confirm(host, command === "grant" ? `Cấp quyền Admin cho ${role.email}` : `Bỏ quyền Admin của ${role.email}`);
      console.log(`✔ ${await applyAdminRole(db, role)}`);
      return;
    }

    // reference
    await confirm(host, `Ghi dữ liệu danh mục (${REFERENCE_COUNTS.categories} danh mục, ${REFERENCE_COUNTS.genres} thể loại, ${REFERENCE_COUNTS.styles} phong cách, ${REFERENCE_COUNTS.licenses} dòng Lợi ích; không xoá gì)`);
    await upsertReferenceData(db);
    console.log("✔ Đã ghi dữ liệu danh mục.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
