/**
 * Pure rule for whether an existing JWT may still be used (CLAUDE.md §13, "sessionVersion").
 * The caller MUST pass the user state freshly read from the database — never values from the token.
 */

export type SessionClaims = {
  uid?: unknown;
  sv?: unknown;
};

export type UserAuthState = {
  id: string;
  status: "ACTIVE" | "LOCKED";
  sessionVersion: number;
  role: "USER" | "ADMIN";
};

export function isSessionValid(claims: SessionClaims, user: UserAuthState | null): user is UserAuthState {
  if (typeof claims.uid !== "string" || typeof claims.sv !== "number") return false;
  if (!user) return false; // user deleted
  if (user.id !== claims.uid) return false;
  if (user.status !== "ACTIVE") return false; // locked account
  return user.sessionVersion === claims.sv; // password changed / sessions revoked
}
