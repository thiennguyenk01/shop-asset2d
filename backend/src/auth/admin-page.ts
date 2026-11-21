import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./current-user";

/**
 * Gate for every Admin page (CLAUDE.md §3 defense in depth, decision "Admin (GĐ5)"). The admin layout checks
 * too, but Next does not re-render layouts on client navigation, so each page's content checks again before
 * reading any data. Anyone who is not an Admin (guests included) gets the ordinary 404 — nothing hints that
 * the area exists. Server actions use `requireAdmin()` (guards.ts) instead.
 */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  return user;
}
