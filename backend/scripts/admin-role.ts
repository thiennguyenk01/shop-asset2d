/**
 * Grant / revoke Admin on an existing account (shared by `admin:grant|revoke` on dev and `db:prod:grant|revoke` on
 * production, GĐ7.7). Two steps so a caller can ask for confirmation between reading and writing:
 * `planAdminRole` only reads; `applyAdminRole` writes what the plan says.
 *
 * - The account must already exist (signed up on the website) — no password ever passes through here.
 * - The role is re-read from the database on every request, so the change applies at once; revoking also bumps
 *   sessionVersion so every open session of that account must sign in again.
 */
import type { PrismaClient } from "../src/generated/prisma/client";

export type AdminAction = "grant" | "revoke";

export type AdminRolePlan =
  | { kind: "error"; message: string }
  | { kind: "noop"; message: string }
  | { kind: "change"; userId: string; email: string; action: AdminAction };

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export async function planAdminRole(db: PrismaClient, rawEmail: string, action: AdminAction): Promise<AdminRolePlan> {
  const email = normalizeEmail(rawEmail);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
  if (!user) return { kind: "error", message: `Không có tài khoản ${email}. Hãy đăng ký trên web trước.` };
  if (action === "grant") {
    if (user.status !== "ACTIVE") return { kind: "error", message: `Tài khoản ${email} đang bị khoá.` };
    if (user.role === "ADMIN") return { kind: "noop", message: `${email} đã là Admin.` };
  } else if (user.role !== "ADMIN") {
    return { kind: "noop", message: `${email} không phải Admin.` };
  }
  return { kind: "change", userId: user.id, email, action };
}

export async function applyAdminRole(db: PrismaClient, plan: Extract<AdminRolePlan, { kind: "change" }>): Promise<string> {
  if (plan.action === "grant") {
    await db.user.update({ where: { id: plan.userId }, data: { role: "ADMIN" } });
    return `${plan.email} giờ là Admin. Tải lại trang để thấy mục "Quản trị" trong menu avatar.`;
  }
  await db.user.update({ where: { id: plan.userId }, data: { role: "USER", sessionVersion: { increment: 1 } } });
  return `Đã bỏ quyền Admin của ${plan.email} (mọi phiên đăng nhập của tài khoản này phải đăng nhập lại).`;
}
