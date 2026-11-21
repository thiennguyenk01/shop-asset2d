/**
 * Rules of the production database commands (GĐ7.4, user choice 2026-11-20: a manual command with confirmation;
 * a separate command for reference data). Pure functions — unit-tested in backend/tests/unit/db-prod.test.ts.
 * The command itself: backend/scripts/db-prod.ts.
 */
import { hostOf, isNeonPooledHost } from "./db-guard";

/** The connection string of the production database lives ONLY in this file (filled in by the user). */
export const PROD_ENV_FILE = ".env.production-db";

const normalize = (h: string) => h.replace(/-pooler(?=\.)/, "");

/** The Neon endpoint id ("ep-long-sun-…"): the first label of the host. What the user types to confirm. */
export function endpointId(host: string): string {
  return normalize(host).split(".")[0];
}

/**
 * The target must be the production database, over a direct (non-pooled) TLS connection:
 * - DIRECT_URL present and parseable;
 * - its host is listed in PRODUCTION_DATABASE_HOSTS (this command is for production ONLY; dev uses `db:*`);
 * - not a Neon `-pooler` host (migrations need a direct connection);
 * - `sslmode=require` (or stricter) in the URL.
 */
export function checkProdTarget(raw: { DIRECT_URL?: string; PRODUCTION_DATABASE_HOSTS?: string }): { host: string | null; problems: string[] } {
  const problems: string[] = [];
  const host = hostOf(raw.DIRECT_URL) ?? null;
  if (!raw.DIRECT_URL) problems.push(`Thiếu DIRECT_URL trong ${PROD_ENV_FILE}.`);
  else if (!host) problems.push(`DIRECT_URL trong ${PROD_ENV_FILE} không đọc được.`);

  const prodHosts = (raw.PRODUCTION_DATABASE_HOSTS ?? "")
    .split(",")
    .map((h) => normalize(h.trim().toLowerCase()))
    .filter(Boolean);
  if (prodHosts.length === 0) problems.push("Thiếu PRODUCTION_DATABASE_HOSTS: không biết host nào là production.");
  if (host) {
    if (prodHosts.length > 0 && !prodHosts.includes(normalize(host))) {
      problems.push(`Host ${host} không nằm trong PRODUCTION_DATABASE_HOSTS: lệnh này chỉ dành cho production (dev dùng npm run db:*).`);
    }
    if (isNeonPooledHost(host)) problems.push("DIRECT_URL đang trỏ tới pooler (-pooler). Migration phải dùng kết nối trực tiếp.");
    const sslmode = new URL(raw.DIRECT_URL!).searchParams.get("sslmode");
    if (!sslmode || !["require", "verify-ca", "verify-full"].includes(sslmode)) {
      problems.push("DIRECT_URL thiếu sslmode=require: kết nối tới production phải mã hoá.");
    }
  }
  return { host, problems };
}

/** The user typed the endpoint id exactly (spaces around it are ignored). */
export function confirmationMatches(typed: string, host: string): boolean {
  return typed.trim() === endpointId(host);
}

/** Migration folders not yet applied, in order (folder names sort by timestamp). */
export function pendingMigrations(folders: readonly string[], applied: readonly string[]): string[] {
  const done = new Set(applied);
  return [...folders].sort().filter((f) => !done.has(f));
}

export type MigrationRow = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

/** A migration that started but neither finished nor was rolled back: fix it by hand before anything else. */
export function failedMigrations(rows: readonly MigrationRow[]): string[] {
  return rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
}

const DESTRUCTIVE: { label: string; re: RegExp }[] = [
  { label: "DROP TABLE", re: /\bDROP\s+TABLE\b/i },
  { label: "DROP COLUMN", re: /\bDROP\s+COLUMN\b/i },
  { label: "DROP SCHEMA", re: /\bDROP\s+SCHEMA\b/i },
  { label: "DROP TYPE", re: /\bDROP\s+TYPE\b/i },
  { label: "TRUNCATE", re: /\bTRUNCATE\b/i },
  { label: "DELETE FROM", re: /\bDELETE\s+FROM\b/i },
  { label: "ALTER COLUMN … TYPE", re: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i },
];

/** SQL with `-- line` and `/* block *\/` comments removed (a comment that mentions DROP is not a DROP). */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Statements in a migration that can lose data. Applying such a migration needs --allow-destructive. */
export function destructiveStatements(sql: string): string[] {
  const code = stripSqlComments(sql);
  return DESTRUCTIVE.filter((d) => d.re.test(code)).map((d) => d.label);
}

export type MigrationPlan = {
  pending: string[];
  /** Reasons not to apply anything. */
  blockers: string[];
  /** Printed, but do not stop the run. */
  notes: string[];
};

/**
 * What `db:prod:migrate` would do, from the database's state:
 * - `history`: rows of `_prisma_migrations`, or null when that table does not exist;
 * - `otherTables`: how many other tables the public schema has.
 * Rules: a failed migration blocks everything; tables without a migration history block (unknown state);
 * on an EMPTY database the old migrations' DROP/DELETE run on empty tables and are allowed (noted);
 * otherwise a pending migration that can lose data needs `allowDestructive`.
 */
export function planMigration(input: {
  folders: readonly string[];
  history: readonly MigrationRow[] | null;
  otherTables: number;
  sqlOf: (folder: string) => string;
  allowDestructive: boolean;
}): MigrationPlan {
  const blockers: string[] = [];
  const notes: string[] = [];
  const rows = input.history ?? [];
  const failed = failedMigrations(rows);
  if (failed.length > 0) blockers.push(`Có migration chạy dở (chưa xong, chưa rollback): ${failed.join(", ")}. Xử lý tay trước.`);
  if (input.history === null && input.otherTables > 0) {
    blockers.push(`Database có ${input.otherTables} bảng nhưng không có lịch sử migration (_prisma_migrations): không rõ trạng thái, không áp gì.`);
  }
  const applied = rows.filter((r) => r.finished_at).map((r) => r.migration_name);
  const unknown = applied.filter((a) => !input.folders.includes(a));
  if (unknown.length > 0) blockers.push(`Database đã áp migration không có trong repo: ${unknown.join(", ")}.`);

  const pending = pendingMigrations(input.folders, applied);
  const freshDatabase = applied.length === 0 && input.otherTables === 0;
  for (const folder of pending) {
    const found = destructiveStatements(input.sqlOf(folder));
    if (found.length === 0) continue;
    if (freshDatabase) notes.push(`${folder}: có ${found.join(", ")}, nhưng database đang trống nên không mất dữ liệu.`);
    else if (input.allowDestructive) notes.push(`${folder}: có ${found.join(", ")} (đã cho phép bằng --allow-destructive).`);
    else blockers.push(`${folder}: có ${found.join(", ")}, có thể mất dữ liệu. Đọc kỹ file SQL; nếu chắc chắn, chạy lại với --allow-destructive.`);
  }
  return { pending, blockers, notes };
}
