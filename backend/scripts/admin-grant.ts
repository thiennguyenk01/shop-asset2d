/**
 * Make an existing account an Admin, or take Admin away (CLAUDE.md §13, decision "Admin (GĐ5)").
 *
 *   npm run admin:grant  -- someone@example.com
 *   npm run admin:revoke -- someone@example.com
 *
 * - The account must already exist (sign up on the website first) — no passwords pass through here or chat.
 * - Refused on production (same guard as db:*); the production procedure is designed with deployment (Phase 7).
 * - The session check re-reads the role from the database on every request, so the change applies at once;
 *   revoking also bumps sessionVersion so every open session of that account must sign in again.
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { checkDbGuard } from "./db-guard";

type Action = "grant" | "revoke";

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

  const email = rawEmail.trim().toLowerCase();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
    if (!user) {
      console.error(`✖ Không có tài khoản ${email}. Hãy đăng ký trên web trước.`);
      process.exit(1);
    }
    if (action === "grant") {
      if (user.status !== "ACTIVE") {
        console.error(`✖ Tài khoản ${email} đang bị khoá.`);
        process.exit(1);
      }
      if (user.role === "ADMIN") console.log(`• ${email} đã là Admin.`);
      else {
        await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
        console.log(`✔ ${email} giờ là Admin. Tải lại trang để thấy mục "Quản trị" trong menu avatar.`);
      }
    } else if (user.role !== "ADMIN") {
      console.log(`• ${email} không phải Admin.`);
    } else {
      await db.user.update({ where: { id: user.id }, data: { role: "USER", sessionVersion: { increment: 1 } } });
      console.log(`✔ Đã bỏ quyền Admin của ${email} (mọi phiên đăng nhập của tài khoản này phải đăng nhập lại).`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
