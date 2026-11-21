/**
 * Guard for every `db:*` npm script (CLAUDE.md §13, decision "Neon").
 *
 *   tsx backend/scripts/db-guard.ts <migrate|seed>
 *
 * Refuses to run when:
 *  - APP_ENV / VERCEL_ENV resolves to production,
 *  - the target host is listed in PRODUCTION_DATABASE_HOSTS,
 *  - DIRECT_URL is missing or points to a Neon pooler (migrations need a direct connection).
 *
 * Applying migrations to production is a separate, explicit step — intentionally not possible through these
 * scripts: `npm run db:prod:*` (backend/scripts/db-prod.ts, GĐ7.4), run by the user, with a typed confirmation.
 */
import { config as loadEnv } from "dotenv";
import { resolveAppEnv } from "../src/env";

export type GuardAction = "migrate" | "seed";

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isNeonPooledHost(host: string | undefined): boolean {
  return !!host && host.split(".")[0].endsWith("-pooler");
}

export function checkDbGuard(action: GuardAction, raw: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const appEnv = resolveAppEnv(raw);
  if (appEnv === "production") {
    problems.push(`Từ chối "${action}": môi trường hiện tại là production.`);
  }

  const directHost = hostOf(raw.DIRECT_URL);
  const pooledHost = hostOf(raw.DATABASE_URL);
  const prodHosts = (raw.PRODUCTION_DATABASE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  // Compare without the "-pooler" suffix so both connection strings of the same Neon endpoint match.
  const normalize = (h: string) => h.replace(/-pooler(?=\.)/, "");
  for (const host of [directHost, pooledHost]) {
    if (host && prodHosts.map(normalize).includes(normalize(host))) {
      problems.push(`Từ chối "${action}": host ${host} nằm trong PRODUCTION_DATABASE_HOSTS.`);
    }
  }

  if (action === "migrate") {
    if (!raw.DIRECT_URL) problems.push("Thiếu DIRECT_URL (kết nối trực tiếp dùng cho migration).");
    else if (isNeonPooledHost(directHost)) {
      problems.push("DIRECT_URL đang trỏ tới pooler (-pooler). Migration phải dùng kết nối trực tiếp.");
    }
  }
  if (action === "seed" && !raw.DATABASE_URL) {
    problems.push("Thiếu DATABASE_URL.");
  }
  return [...new Set(problems)];
}

function main() {
  const action = process.argv[2] as GuardAction | undefined;
  if (action !== "migrate" && action !== "seed") {
    console.error("Cách dùng: tsx backend/scripts/db-guard.ts <migrate|seed>");
    process.exit(2);
  }
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const problems = checkDbGuard(action, process.env);
  if (problems.length > 0) {
    console.error(`✖ db-guard:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  if (process.env.DATABASE_URL && !isNeonPooledHost(hostOf(process.env.DATABASE_URL))) {
    console.warn("⚠ DATABASE_URL không phải host -pooler của Neon. Trên Vercel nên dùng kết nối pooled.");
  }
  console.log(`✔ db-guard: cho phép "${action}" (${resolveAppEnv(process.env)}).`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db-guard.ts")) {
  main();
}
