/**
 * `npm run storage:push` (GĐ7.5): copy every object of the local storage (`.storage/public`, `.storage/private`)
 * to the R2 buckets of .env.local, so the dev database keeps working after switching STORAGE_DRIVER to r2.
 * Objects already in R2 with the same size are skipped (safe to run again); nothing is deleted anywhere.
 * Refused when APP_ENV is production (the production buckets only get what the Admin uploads there).
 *
 *   npm run storage:push               → copy
 *   npm run storage:push -- --dry-run  → only count what would be copied
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { LocalStorage } from "../src/storage/local";
import type { Bucket } from "../src/storage/types";
import { loadR2 } from "./storage-r2-env";

const { env, r2 } = loadR2("storage:push");
const dryRun = process.argv.includes("--dry-run");

async function localKeys(root: string, bucket: Bucket): Promise<{ key: string; size: number }[]> {
  const dir = path.resolve(root, bucket);
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: { key: string; size: number }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out.push({ key: path.relative(dir, full).split(path.sep).join("/"), size: (await stat(full)).size });
  }
  return out;
}

async function main() {
  if (env.APP_ENV === "production") {
    console.error("✖ storage:push bị từ chối trên production.");
    process.exit(1);
  }
  const local = new LocalStorage(env.STORAGE_LOCAL_ROOT);
  const totals = { copied: 0, skipped: 0, bytes: 0 };
  for (const bucket of ["public", "private"] as const) {
    const objects = await localKeys(env.STORAGE_LOCAL_ROOT, bucket);
    const remote = new Map<string, number>();
    for (const top of new Set(objects.map((o) => o.key.split("/")[0]))) {
      if (!objects.some((o) => o.key.startsWith(`${top}/`))) continue;
      for (const o of await r2.list(bucket, top)) remote.set(o.key, o.sizeBytes);
    }
    for (const o of objects) {
      if (remote.get(o.key) === o.size) {
        totals.skipped++;
        continue;
      }
      if (!dryRun) await r2.put(bucket, o.key, await local.read(bucket, o.key));
      totals.copied++;
      totals.bytes += o.size;
    }
    console.log(`✔ ${bucket === "public" ? "bucket công khai" : "bucket file bán"}: ${objects.length} file ở .storage`);
  }
  const mb = (totals.bytes / 1024 / 1024).toFixed(1);
  console.log(
    dryRun
      ? `Chạy thử: sẽ chép ${totals.copied} file (${mb} MB), bỏ qua ${totals.skipped} file đã có trên R2.`
      : `Đã chép ${totals.copied} file (${mb} MB) lên R2, bỏ qua ${totals.skipped} file đã có.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
