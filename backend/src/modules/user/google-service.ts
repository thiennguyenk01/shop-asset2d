import "server-only";
import { Prisma, type Locale } from "@backend/generated/prisma/client";
import { planGoogleSignIn, type GoogleIdentity, type GoogleRefusal } from "@backend/lib/auth/google";
import { databaseBlockedByFreeTier } from "@backend/modules/usage/guard";
import { createGoogleUser, findUserByGoogleAccount, findUserStatusByEmail, linkGoogleAccount } from "./repository";

export type GoogleSignInResult =
  | { ok: true; userId: string; isNew: boolean }
  /** paused: "free plans only" is on and the database is full, so no new account can be created (DECISIONS #59). */
  | { ok: false; reason: GoogleRefusal | "paused" };

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * "Continue with Google" (user choice 2026-11-26): sign in the account linked to this Google account, join an
 * existing account with the same (Google-verified) email, or create one. Every account is a USER (ADMIN is never
 * self-assigned). Two sign-ins racing for the same email or Google account hit a unique index: the loser plans
 * again and finds what the winner made.
 */
export async function resolveGoogleSignIn(identity: GoogleIdentity, locale: Locale, now = new Date()): Promise<GoogleSignInResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [linked, byEmail] = await Promise.all([findUserByGoogleAccount(identity.sub), findUserStatusByEmail(identity.email)]);
    const plan = planGoogleSignIn(identity, linked, byEmail);
    try {
      switch (plan.kind) {
        case "refuse":
          return { ok: false, reason: plan.reason };
        case "signIn":
          return { ok: true, userId: plan.userId, isNew: false };
        case "link":
          await linkGoogleAccount(plan.userId, identity.sub, now);
          return { ok: true, userId: plan.userId, isNew: false };
        case "create": {
          if (await databaseBlockedByFreeTier()) return { ok: false, reason: "paused" };
          const user = await createGoogleUser({ email: identity.email, name: identity.name, preferredLocale: locale, sub: identity.sub }, now);
          return { ok: true, userId: user.id, isNew: true };
        }
      }
    } catch (e) {
      if (!isUniqueViolation(e) || attempt > 0) throw e;
    }
  }
  throw new Error("unreachable");
}
