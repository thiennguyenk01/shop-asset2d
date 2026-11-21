/**
 * E2E clean-up (GĐ7.2): remove ONE pack an E2E test created, when the test failed before deleting it through
 * the Admin UI — otherwise the left-over PUBLISHED pack changes the shop counts of later runs.
 *
 *   npx tsx backend/scripts/e2e-remove-pack.ts e2e-pack-<id>
 *
 * - Only slugs starting with `e2e-pack-` (what frontend/tests/e2e/admin-products.spec.ts creates); anything else is refused.
 * - Only a pack nobody bought (no order line, entitlement or extra-download credit).
 * - Refused on production (same guard as db:*). No pack → nothing to do (exit 0).
 * Its uploaded files become orphans; the cleanup job removes them after 24 hours (`npm run cron:run -- cleanup`).
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { checkDbGuard } from "./db-guard";

const E2E_SLUG = /^e2e-pack-[a-z0-9-]{1,64}$/;

async function main() {
  const slug = process.argv[2] ?? "";
  if (!E2E_SLUG.test(slug)) {
    console.error("Cách dùng: npx tsx backend/scripts/e2e-remove-pack.ts e2e-pack-<id> (chỉ bộ do E2E tạo)");
    process.exit(2);
  }
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const problems = checkDbGuard("seed", process.env);
  if (problems.length > 0) {
    console.error(`✖ e2e-remove-pack bị từ chối:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const { count } = await db.product.deleteMany({
      where: { slug, orderItems: { none: {} }, entitlements: { none: {} }, downloadCredits: { none: {} } },
    });
    console.log(count ? `✔ Đã xoá bộ ${slug}.` : `Không có bộ ${slug} (hoặc đã có người mua): không làm gì.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
