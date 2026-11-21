import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "./index";

export type CurrentUser = { id: string; name: string | null; email: string | null; role: "USER" | "ADMIN" };

/**
 * The signed-in user, or null. Reads the session cookie, so call it inside a <Suspense> boundary
 * (Cache Components). `auth()` runs the jwt callback, which re-checks status + sessionVersion in the
 * database (CLAUDE.md §13). Memoised with React `cache` for ONE request only (never across requests),
 * so several components can ask without repeating the database check.
 * Returns only what the UI needs (Data Access Layer).
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  // Request time only: Auth.js re-encrypts the session cookie with a random IV (crypto.getRandomValues),
  // which Cache Components refuses during (runtime) prerendering. See docs "blocking-prerender-crypto".
  await connection();
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name ?? null, email: user.email ?? null, role: user.role };
}); // React cache: one session check per request even when the top bar, cart badge and page all ask
