/**
 * Make an existing account an Admin, or take Admin away (CLAUDE.md §13, decision "Admin (GĐ5)").
 *
 *   npm run admin:grant  -- someone@example.com
 *   npm run admin:revoke -- someone@example.com
 *
 * - The account must already exist (sign up on the website first) — no passwords pass through here or chat.
 * - Refused on production (same guard as db:*); on production: `npm run db:prod:grant|revoke` (GĐ7.7, typed
 *   confirmation). Shared logic: ./admin-role.ts.
 * - The session check re-reads the role from the database on every request, so the change applies at once;
 *   revoking also bumps sessionVersion so every open session of that account must sign in again.
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { applyAdminRole, planAdminRole, type AdminAction as Action } from "./admin-role";
import { checkDbGuard } from "./db-guard";

async function main() {
  const [action, rawEmail] = process.argv.slice(2) as [Action | undefined, string | undefined];
  if ((action !== "grant" && action !== "revoke") || !rawEmail) {
    console.error("Cách dùng: npm run admin:grant -- <email>   |   npm run admin:revoke -- <email>");
    process.exit(2);
  }
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const problems = checkDbGuard("seed", process.env);
  if (problems.length > 0) {
    console.error(`✖ admin:${action} bị từ chối:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const plan = await planAdminRole(db, rawEmail, action);
    if (plan.kind === "error") {
      console.error(`✖ ${plan.message}`);
      process.exit(1);
    }
    if (plan.kind === "noop") console.log(`• ${plan.message}`);
    else console.log(`✔ ${await applyAdminRole(db, plan)}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
