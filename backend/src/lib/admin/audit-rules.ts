/**
 * The Admin action log (GĐ5.7, DECISIONS #36), pure so it is unit-tested: every action the Admin area writes to
 * AuditLog (a unit test checks this list against the code), the list filters from the URL (unknown values are
 * ignored, never an error) and where each logged thing lives in the Admin area. Read-only: nothing here edits
 * or deletes a log row.
 */
export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_ACTIONS = [
  "product.create",
  "product.update",
  "product.delete",
  "product.publish",
  "product.hide",
  "product.draft",
  "product.section.add",
  "product.section.update",
  "product.section.delete",
  "product.media.add",
  "product.media.cover",
  "product.media.reorder",
  "product.media.delete",
  "product.version.create",
  "product.version.update",
  "product.version.release",
  "product.version.delete",
  "product.file.add",
  "product.file.delete",
  "order.refund",
  "order.manual",
  "transfer.resolve",
  "user.lock",
  "user.unlock",
  "user.gift",
  "user.giftRevoke",
  "coupon.create",
  "coupon.update",
  "coupon.delete",
  "settings.update",
  "settings.freeTier",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const isAuditAction = (v: unknown): v is AuditAction =>
  typeof v === "string" && (AUDIT_ACTIONS as readonly string[]).includes(v);

type Underscored<S extends string> = S extends `${infer A}.${infer B}` ? `${A}_${Underscored<B>}` : S;
export type AuditActionKey = Underscored<AuditAction>;

/** Translation key for an action: dots become underscores ("product.media.add" → "product_media_add"). */
export const auditActionKey = (a: AuditAction) => a.replace(/\./g, "_") as AuditActionKey;

const ID_RE = /^[a-z0-9]{10,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHOP_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-11-19" (a shop day, UTC+7) → its first instant; malformed or impossible dates → null. */
export function shopDayStart(raw: unknown): Date | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const check = new Date(utc);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - SHOP_OFFSET_MS);
}

export type AuditFilters = {
  adminId: string | undefined;
  action: AuditAction | undefined;
  /** Shop days as typed ("YYYY-MM-DD"), kept for the form. */
  from: string | undefined;
  to: string | undefined;
  /** Instants for the query: [since, until). `to` is inclusive: until = the day after `to`. */
  since: Date | undefined;
  until: Date | undefined;
  page: number;
};

export function parseAuditFilters(raw: {
  admin?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
}): AuditFilters {
  const adminId = raw.admin && ID_RE.test(raw.admin) ? raw.admin : undefined;
  const action = isAuditAction(raw.action) ? raw.action : undefined;
  let since = shopDayStart(raw.from) ?? undefined;
  const toStart = shopDayStart(raw.to);
  let until = toStart ? new Date(toStart.getTime() + 24 * 60 * 60 * 1000) : undefined;
  let from = since ? raw.from : undefined;
  let to = until ? raw.to : undefined;
  if (since && until && since >= until) {
    // Typed the wrong way round: swap rather than show nothing.
    [since, until] = [new Date(until.getTime() - 24 * 60 * 60 * 1000), new Date(since.getTime() + 24 * 60 * 60 * 1000)];
    [from, to] = [to, from];
  }
  const n = Number(raw.page ?? 1);
  return { adminId, action, from, to, since, until, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
}

/**
 * Where the logged thing lives in the Admin area, or null when there is no page for it any more (a deleted pack
 * or coupon) — the row then shows the id only.
 */
export function auditTargetHref(row: { action: string; entity: string; entityId: string }): string | null {
  if (row.action === "product.delete" || row.action === "coupon.delete") return null;
  switch (row.entity) {
    case "Product":
      return `/admin/products/${row.entityId}`;
    case "User":
      return `/admin/users/${row.entityId}`;
    case "Coupon":
      return `/admin/coupons/${row.entityId}`;
    case "ShopSettings":
      return "/admin/settings";
    case "UnmatchedTransfer":
      return "/admin/orders/transfers?state=all";
    default:
      return null; // "Order": the row links by the order code kept in its diff (see the page)
  }
}
