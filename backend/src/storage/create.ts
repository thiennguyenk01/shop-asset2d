import type { Env } from "../env";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";

/**
 * The storage driver named by the (already validated) env: `local` (dev, `.storage/` outside `public/`) or `r2`
 * (GĐ7.5). Shared by the app (`getStorage`), the seed and the scripts. No `server-only`: the seed runs outside Next.
 */
export function createStorage(env: Env): LocalStorage | R2Storage {
  if (env.STORAGE_DRIVER === "local") return new LocalStorage(env.STORAGE_LOCAL_ROOT);
  return new R2Storage({
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    publicBucket: env.R2_PUBLIC_BUCKET!,
    privateBucket: env.R2_PRIVATE_BUCKET!,
  });
}
