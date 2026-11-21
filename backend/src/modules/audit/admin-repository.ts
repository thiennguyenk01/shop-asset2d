import "server-only";
import type { Prisma } from "@backend/generated/prisma/client";
import type { AuditAction } from "@backend/lib/admin/audit-rules";
import { getDb } from "@backend/db";

/** The Admin action log (GĐ5.7, DECISIONS #36). Read-only: there is no write or delete here. */
export function findAuditPage(
  filters: { adminId?: string; action?: AuditAction; since?: Date; until?: Date },
  skip: number,
  take: number,
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.adminId ? { adminId: filters.adminId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.since || filters.until
      ? {
          createdAt: {
            ...(filters.since ? { gte: filters.since } : {}),
            ...(filters.until ? { lt: filters.until } : {}),
          },
        }
      : {}),
  };
  // Count + page read side by side, not in a $transaction([...]): inside a transaction Prisma sends a query's
  // relation sub-queries concurrently on one connection, which pg deprecates (warning, removed in pg@9).
  return Promise.all([
    getDb().auditLog.count({ where }),
    getDb().auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        diff: true,
        createdAt: true,
        admin: { select: { id: true, email: true } },
      },
    }),
  ]);
}

/** Everyone who has written to the log (for the Admin filter), including former Admins. */
export async function findAuditAdmins() {
  const ids = await getDb().auditLog.groupBy({ by: ["adminId"] });
  return getDb().user.findMany({
    where: { id: { in: ids.map((r) => r.adminId) } },
    orderBy: { email: "asc" },
    select: { id: true, email: true },
  });
}
