/**
 * "Continue with Google" (user choice 2026-11-26), pure rules so they are unit-tested:
 * - what Google told us about the person (`readGoogleProfile`);
 * - what to do with it (`planGoogleSignIn`): the account already linked to that Google account signs in; otherwise
 *   an account with the same email is joined to Google (only when Google has verified the email); otherwise a new
 *   account is created. A locked account never signs in, whichever way.
 * - which message the sign-in page shows when it did not work (`googleErrorFromParam`).
 */

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The OpenID profile Google returned; anything malformed → null (the sign-in is refused). */
export function readGoogleProfile(profile: unknown): GoogleIdentity | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const sub = typeof p.sub === "string" ? p.sub.trim() : "";
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!sub || sub.length > 255 || !email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  const rawName = typeof p.name === "string" ? p.name.trim().slice(0, 80) : "";
  return {
    sub,
    email,
    // Google sends a boolean; be strict about anything else.
    emailVerified: p.email_verified === true,
    name: rawName || null,
  };
}

type Account = { id: string; status: "ACTIVE" | "LOCKED" };

export type GoogleRefusal = "unverified" | "locked";
export type GoogleSignInPlan =
  | { kind: "signIn"; userId: string }
  | { kind: "link"; userId: string }
  | { kind: "create" }
  | { kind: "refuse"; reason: GoogleRefusal };

/**
 * `linked`: the account already joined to this Google account (by Google's stable id, not the email);
 * `byEmail`: the account whose email is the Google email, if any.
 */
export function planGoogleSignIn(identity: GoogleIdentity, linked: Account | null, byEmail: Account | null): GoogleSignInPlan {
  if (linked) return linked.status === "ACTIVE" ? { kind: "signIn", userId: linked.id } : { kind: "refuse", reason: "locked" };
  // Joining or creating relies on the email being the person's own: Google must have verified it.
  if (!identity.emailVerified) return { kind: "refuse", reason: "unverified" };
  if (byEmail) return byEmail.status === "ACTIVE" ? { kind: "link", userId: byEmail.id } : { kind: "refuse", reason: "locked" };
  return { kind: "create" };
}

/** `?error=` values the sign-in page understands. */
export const GOOGLE_ERRORS = ["unverified", "locked", "paused", "failed"] as const;
export type GoogleError = (typeof GOOGLE_ERRORS)[number];

/** Our own `google-<reason>`; anything else Auth.js may append (AccessDenied, Configuration, OAuthCallbackError…) → "failed". */
export function googleErrorFromParam(raw: unknown): GoogleError | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value || value.length > 64) return null;
  const ours = /^google-([a-z]+)$/.exec(value)?.[1];
  if (ours && (GOOGLE_ERRORS as readonly string[]).includes(ours)) return ours as GoogleError;
  return "failed";
}
