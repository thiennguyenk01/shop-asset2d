import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkProdTarget,
  confirmationMatches,
  destructiveStatements,
  endpointId,
  failedMigrations,
  pendingMigrations,
  planMigration,
  type MigrationRow,
} from "../../scripts/db-prod-rules";

/** GĐ7.4 — the production database commands (backend/scripts/db-prod.ts): who may run what, and when it refuses. */
const PROD = "ep-long-sun-aowyt90y.ap-southeast-1.aws.neon.tech";
const DEV = "ep-wild-brook-ao7rgaie.ap-southeast-1.aws.neon.tech";
const url = (host: string, q = "?sslmode=require") => `postgresql://u:p@${host}/neondb${q}`;
const done = (name: string): MigrationRow => ({ migration_name: name, finished_at: new Date(), rolled_back_at: null });

describe("target", () => {
  it("accepts only the production host, direct, with TLS", () => {
    expect(checkProdTarget({ DIRECT_URL: url(PROD), PRODUCTION_DATABASE_HOSTS: PROD })).toEqual({ host: PROD, problems: [] });
    // listed with or without -pooler: the same endpoint
    expect(checkProdTarget({ DIRECT_URL: url(PROD), PRODUCTION_DATABASE_HOSTS: PROD.replace(".ap", "-pooler.ap") }).problems).toEqual([]);
  });

  it("refuses: a dev host, the pooler, no TLS, nothing configured", () => {
    expect(checkProdTarget({ DIRECT_URL: url(DEV), PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/không nằm trong/);
    expect(checkProdTarget({ DIRECT_URL: url(PROD.replace(".ap", "-pooler.ap")), PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/pooler/);
    expect(checkProdTarget({ DIRECT_URL: url(PROD, ""), PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/sslmode/);
    expect(checkProdTarget({ DIRECT_URL: url(PROD, "?sslmode=disable"), PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/sslmode/);
    expect(checkProdTarget({ DIRECT_URL: url(PROD) }).problems.join()).toMatch(/PRODUCTION_DATABASE_HOSTS/);
    expect(checkProdTarget({ PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/Thiếu DIRECT_URL/);
    expect(checkProdTarget({ DIRECT_URL: "not a url", PRODUCTION_DATABASE_HOSTS: PROD }).problems.join()).toMatch(/không đọc được/);
  });

  it("confirmation = the exact Neon endpoint id", () => {
    expect(endpointId(PROD)).toBe("ep-long-sun-aowyt90y");
    expect(endpointId(PROD.replace(".ap", "-pooler.ap"))).toBe("ep-long-sun-aowyt90y");
    expect(confirmationMatches("  ep-long-sun-aowyt90y \n", PROD)).toBe(true);
    for (const typed of ["", "y", "yes", "EP-LONG-SUN-AOWYT90Y", "ep-long-sun", PROD]) expect(confirmationMatches(typed, PROD)).toBe(false);
  });
});

describe("migrations", () => {
  it("pending = folders not applied yet, in order; failed = started, neither finished nor rolled back", () => {
    expect(pendingMigrations(["b", "a", "c"], ["a"])).toEqual(["b", "c"]);
    expect(failedMigrations([done("a"), { migration_name: "b", finished_at: null, rolled_back_at: null }])).toEqual(["b"]);
    expect(failedMigrations([{ migration_name: "b", finished_at: null, rolled_back_at: new Date() }])).toEqual([]);
  });

  it("finds statements that can lose data, ignoring comments", () => {
    expect(destructiveStatements('ALTER TABLE "X" DROP COLUMN "y";\nTRUNCATE "Z";')).toEqual(["DROP COLUMN", "TRUNCATE"]);
    expect(destructiveStatements('ALTER TABLE "A" ALTER COLUMN "b" SET DATA TYPE TEXT;')).toEqual(["ALTER COLUMN … TYPE"]);
    expect(destructiveStatements('-- DROP TABLE "X"\n/* DELETE FROM "Y" */\nCREATE TABLE "Z" (id int);')).toEqual([]);
    expect(destructiveStatements('CREATE INDEX "i" ON "t"("c");\nALTER TABLE "t" ADD COLUMN "d" int;')).toEqual([]);
  });

  const sql: Record<string, string> = { "1_init": "CREATE TABLE a (id int);", "2_drop": "DROP TABLE a;", "3_add": "CREATE TABLE b (id int);" };
  const base = { folders: Object.keys(sql), sqlOf: (f: string) => sql[f], allowDestructive: false };

  it("an empty database: everything is applied; old DROPs only noted (no data to lose)", () => {
    const plan = planMigration({ ...base, history: null, otherTables: 0 });
    expect(plan).toMatchObject({ pending: ["1_init", "2_drop", "3_add"], blockers: [] });
    expect(plan.notes.join()).toMatch(/2_drop.*database đang trống/);
  });

  it("a database in use: a pending DROP needs --allow-destructive", () => {
    const history = [done("1_init")];
    expect(planMigration({ ...base, history, otherTables: 5 }).blockers.join()).toMatch(/2_drop.*--allow-destructive/);
    const allowed = planMigration({ ...base, history, otherTables: 5, allowDestructive: true });
    expect(allowed).toMatchObject({ pending: ["2_drop", "3_add"], blockers: [] });
  });

  it("blocks: a failed migration, tables without history, a migration the repo does not have", () => {
    const failed = planMigration({ ...base, history: [done("1_init"), { migration_name: "2_drop", finished_at: null, rolled_back_at: null }], otherTables: 3 });
    expect(failed.blockers.join()).toMatch(/chạy dở.*2_drop/);
    expect(planMigration({ ...base, history: null, otherTables: 4 }).blockers.join()).toMatch(/không có lịch sử migration/);
    expect(planMigration({ ...base, history: [done("0_elsewhere")], otherTables: 1 }).blockers.join()).toMatch(/không có trong repo.*0_elsewhere/);
  });

  it("the repo's migrations: on an empty production database, the first run is allowed without the flag", () => {
    const dir = path.resolve(__dirname, "../../prisma/migrations");
    const folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const plan = planMigration({ folders, history: null, otherTables: 0, sqlOf: (f) => readFileSync(path.join(dir, f, "migration.sql"), "utf8"), allowDestructive: false });
    expect(plan.blockers).toEqual([]);
    expect(plan.pending).toHaveLength(folders.length);
  });
});
