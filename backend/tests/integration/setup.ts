import { config as loadEnv } from "dotenv";
import { checkDbGuard } from "../../scripts/db-guard";

// Same env files as `db:*` (Next's loadEnvConfig skips .env.local under NODE_ENV=test), then the same guard:
// integration tests write test rows, never on production.
loadEnv({ path: [".env.local", ".env"], quiet: true });
const problems = checkDbGuard("seed", process.env);
if (problems.length > 0) throw new Error(`Integration tests refused:\n- ${problems.join("\n- ")}`);

// Always the local storage driver (GĐ7.5), even when .env.local says r2: these tests read the files and the
// `/api/files/…` tokens the services produce, and leave nothing in the R2 buckets. The R2 side is checked by
// `npm run storage:check` and by the E2E suite (which runs on whatever .env.local says).
process.env.STORAGE_DRIVER = "local";
