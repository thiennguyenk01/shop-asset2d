/**
 * Shared by `npm run storage:check` and `storage:push` (GĐ7.5): read .env.local and validate the R2 settings as if
 * STORAGE_DRIVER were r2 (both commands work before the app is switched over). Never prints a key or a secret.
 */
import { config as loadEnv } from "dotenv";
import { parseEnv, type Env } from "../src/env";
import { R2Storage } from "../src/storage/r2";

export function loadR2(command: string): { env: Env; r2: R2Storage } {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  let env: Env;
  try {
    env = parseEnv({ ...process.env, STORAGE_DRIVER: "r2" });
  } catch (e) {
    console.error(`✖ ${command}: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  const r2 = new R2Storage({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    publicBucket: env.R2_PUBLIC_BUCKET!,
    privateBucket: env.R2_PRIVATE_BUCKET!,
  });
  return { env, r2 };
}
