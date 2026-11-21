import "server-only";
import { AUDIT_PAGE_SIZE, auditTargetHref, isAuditAction, type AuditAction } from "@backend/lib/admin/audit-rules";
import { findAuditAdmins, findAuditPage } from "./admin-repository";

/**
 * The Admin action log (GĐ5.7, DECISIONS #36): newest first, 50 per page, filtered by Admin, action and shop
 * days. Read-only. The page layer checks the Admin; this layer applies lib/admin/audit-rules.ts.
 */
export type AuditRow = {
  id: string;
  /** null for an action this version does not know (shown as written). */
  action: AuditAction | null;
  rawAction: string;
  entity: string;
  entityId: string;
  createdAt: Date;
  adminId: string;
  adminEmail: string;
  /** Where the thing lives in the Admin area; null = gone (deleted) or no page. */
  href: string | null;
  /** A readable name when the log row carries one: order code, pack slug, coupon code. */
  label: string | null;
  diff: unknown;
};

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

export async function listAuditLog(
  filters: { adminId?: string; action?: AuditAction; since?: Date; until?: Date },
  page: number,
): Promise<{ items: AuditRow[]; total: number; page: number; pageCount: number }> {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findAuditPage(filters, (safePage - 1) * AUDIT_PAGE_SIZE, AUDIT_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  if (safePage > pageCount && total > 0) return listAuditLog(filters, pageCount);
  const items = rows.map((r): AuditRow => {
    const d = (r.diff && typeof r.diff === "object" ? r.diff : {}) as Record<string, unknown>;
    const after = (d.after && typeof d.after === "object" ? d.after : {}) as Record<string, unknown>;
    const orderCode = r.entity === "Order" ? str(d.code) : null;
    return {
      id: r.id,
      action: isAuditAction(r.action) ? r.action : null,
      rawAction: r.action,
      entity: r.entity,
      entityId: r.entityId,
      createdAt: r.createdAt,
      adminId: r.admin.id,
      adminEmail: r.admin.email,
      href: orderCode ? `/admin/orders/${orderCode}` : auditTargetHref(r),
      label: orderCode ?? str(d.slug) ?? str(d.code) ?? str(after.code) ?? null,
      diff: r.diff,
    };
  });
  return { items, total, page: Math.min(safePage, pageCount), pageCount };
}

export function listAuditAdmins() {
  return findAuditAdmins();
}
