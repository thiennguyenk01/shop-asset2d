/**
 * Admin users (GĐ5.5, DECISIONS #34), pure so they are unit-tested:
 * - only ordinary accounts can be locked (never an Admin, never oneself); a lock needs a reason;
 * - a gift is a PUBLISHED PREMIUM pack the customer does not own yet (free packs are open to everyone);
 * - list filters from the URL: unknown values are ignored, never an error.
 */
export const ADMIN_USERS_PAGE_SIZE = 20;
/** Orders and library packs per page on one account's Admin page (user request 2026-11-21). */
export const ADMIN_USER_DETAIL_PAGE_SIZE = 5;

/**
 * A page number from the URL, kept within [1, pageCount] for `total` rows at `size` per page (bad values → 1; past
 * the end → the last page, so taking back the last gift of a page never shows an empty list).
 */
export function clampPage(raw: unknown, total: number, size: number): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / size));
  const n = typeof raw === "string" && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return { page: Math.min(Math.max(1, n), pageCount), pageCount };
}
export const ADMIN_USER_SEARCH_MAX = 80;
export const ADMIN_NOTE_MAX = 500;
export const USER_ROLES = ["USER", "ADMIN"] as const;
export const USER_STATUSES = ["ACTIVE", "LOCKED"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

export type LockBlock = "isAdmin" | "self" | "alreadyLocked";

export function lockBlock(
  target: { id: string; role: UserRole; status: UserStatus },
  adminId: string,
): LockBlock | null {
  if (target.id === adminId) return "self";
  if (target.role === "ADMIN") return "isAdmin";
  if (target.status === "LOCKED") return "alreadyLocked";
  return null;
}

export function unlockBlock(target: { status: UserStatus }): "notLocked" | null {
  return target.status === "LOCKED" ? null : "notLocked";
}

export type GiftBlock = "notFound" | "notPremium" | "notPublished" | "alreadyOwned";

/** `pack` null = no such pack; `owned` = the customer has access now (bought, gifted — not revoked). */
export function giftBlock(
  pack: { type: "FREE" | "PREMIUM"; status: "DRAFT" | "PUBLISHED" | "HIDDEN" } | null,
  owned: boolean,
): GiftBlock | null {
  if (!pack) return "notFound";
  if (pack.type !== "PREMIUM") return "notPremium";
  if (pack.status !== "PUBLISHED") return "notPublished";
  if (owned) return "alreadyOwned";
  return null;
}

export type TextError = "reasonRequired" | "tooLong";

/** A lock reason: required, trimmed, at most ADMIN_NOTE_MAX characters. */
export function parseLockReason(raw: unknown): { ok: true; text: string } | { ok: false; error: TextError } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "reasonRequired" };
  if (text.length > ADMIN_NOTE_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, text };
}

/** An optional note (gift, unlock): empty → null. */
export function parseNote(raw: unknown): { ok: true; text: string | null } | { ok: false; error: "tooLong" } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length > ADMIN_NOTE_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, text: text || null };
}

export type AdminUserFilters = { q: string; role: UserRole | undefined; status: UserStatus | undefined; page: number };

export function parseAdminUserFilters(raw: {
  q?: string;
  role?: string;
  status?: string;
  page?: string;
}): AdminUserFilters {
  const q = (raw.q ?? "").trim().slice(0, ADMIN_USER_SEARCH_MAX);
  const role = USER_ROLES.find((r) => r === raw.role);
  const status = USER_STATUSES.find((s) => s === raw.status);
  const n = Number(raw.page ?? 1);
  return { q, role, status, page: Number.isSafeInteger(n) && n > 0 ? n : 1 };
}
