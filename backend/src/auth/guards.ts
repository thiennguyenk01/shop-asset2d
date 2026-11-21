import "server-only";
import { auth } from "./index";

export class AuthError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
  }
}

/**
 * Guards for server actions / route handlers. They call `auth()`, which runs the
 * `jwt` callback and therefore re-validates sessionVersion against the database.
 * Use them in every protected action even when a layout already checked (defense in depth).
 */
/** The signed-in user or null (for actions that also work for guests, e.g. the cart). Re-validates like requireUser. */
export async function getSessionUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("UNAUTHENTICATED");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AuthError("FORBIDDEN");
  return user;
}
