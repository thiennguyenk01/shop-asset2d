/**
 * Run the scheduled jobs by hand in development (GĐ6.3) — the same code /api/cron/<job> runs on a schedule once
 * deployed. Refused on production (same guard as db:*), like admin:grant.
 *
 *   npm run cron:run                 → reconcile + cleanup
 *   npm run cron:run -- reconcile    → PENDING orders past their expiry (+15 min) → EXPIRED
 *   npm run cron:run -- cleanup      → guest carts untouched 30 days, abandoned uploads older than 24 h
 */
import { config as loadEnv } from "dotenv";
import { checkDbGuard } from "./db-guard";

async function main() {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const problems = checkDbGuard("seed", process.env);
  if (problems.length > 0) {
    console.error(`✖ cron:run bị từ chối:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  // Imported after the guard: the service module opens the database connection.
  const { CRON_JOBS, isCronJob } = await import("../src/lib/cron/rules");
  const { runCronJob } = await import("../src/modules/maintenance/service");
  const arg = process.argv[2];
  if (arg !== undefined && !isCronJob(arg)) {
    console.error(`Cách dùng: npm run cron:run [-- ${CRON_JOBS.join(" | ")}]`);
    process.exit(2);
  }
  for (const job of arg ? [arg] : CRON_JOBS) console.log(`✔ ${job}:`, JSON.stringify(await runCronJob(job)));
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
