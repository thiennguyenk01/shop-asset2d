import "server-only";
import { cookies } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { getEnv } from "@backend/env";
import { setFlash } from "@backend/flash";
import { LOCALE_COOKIE, routing, type Locale } from "@backend/i18n/routing";
import { readGoogleProfile, type GoogleError } from "@backend/lib/auth/google";
import { clientIp, loginSubjects } from "@backend/lib/rate-limit/rules";
import { mergeGuestCartOnSignIn } from "@backend/modules/cart/session";
import { checkRateLimit, clearRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { resolveGoogleSignIn } from "@backend/modules/user/google-service";
import { findUserAuthState, findUserByGoogleAccount, findUserForLogin, GOOGLE_PROVIDER } from "@backend/modules/user/repository";
import { getDummyHash, verifyPassword } from "./password";
import { isSessionValid } from "./session-validation";

/**
 * Auth.js v5 — Credentials + JWT session (Credentials does not support database sessions).
 *
 * Security rule (CLAUDE.md §13): on EVERY session read the `jwt` callback re-loads
 * status + sessionVersion from the database. Returning `null` makes Auth.js delete
 * the session cookie, so tokens of locked users or issued before a password change die.
 * If the database is unreachable the callback throws and Auth.js also clears the
 * session (fail closed).
 *
 * UI: /login, /register (Phase 3.1), /account (profile + change password, Phase 3.2).
 *
 * Failed sign-ins are limited per email and per IP (GĐ7.1, lib/rate-limit/rules.ts). The check lives HERE, in
 * authorize(), so it also covers a direct POST to /api/auth/callback/credentials; the login form checks first
 * as well, only to say how long to wait.
 *
 * "Continue with Google" (user choice 2026-11-26) is on only when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set. There
 * is no Auth.js database adapter: the `signIn` callback finds, joins or creates OUR account
 * (modules/user/google-service.ts) and the `jwt` callback then reads that account from the database, so a Google
 * session carries the same uid + sessionVersion as any other and is re-checked on every read like any other.
 */

/** "Continue with Google" is offered only when the shop's Google OAuth client is configured. */
export function googleSignInEnabled(): boolean {
  const env = getEnv();
  return !!env.AUTH_GOOGLE_ID && !!env.AUTH_GOOGLE_SECRET;
}

/** The language the visitor reads the site in (the OAuth callback URL has none): the remembered choice, else vi. */
async function visitorLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}

const googleRefused = async (reason: GoogleError) => `/${await visitorLocale()}/login?error=google-${reason}`;

const credentialsSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Errors Auth.js raises itself (Google refused, user cancelled, misconfiguration) land on the sign-in page too.
  pages: { signIn: "/vi/login", error: "/vi/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const subjects = loginSubjects(parsed.data.email, clientIp(request.headers));
        // Too many failures: refused without even checking the password (same answer as a wrong password).
        if ((await checkRateLimit(subjects)).limited) return null;
        const user = await findUserForLogin(parsed.data.email);
        // Always run one argon2 verification so response time does not reveal whether the email exists.
        const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), parsed.data.password);
        if (!user || !user.passwordHash || !ok || user.status !== "ACTIVE") {
          await recordFailure(subjects);
          return null;
        }
        await clearRateLimit(subjects[0]); // the email's counter; the IP keeps its count
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    ...(googleSignInEnabled()
      ? [Google({ clientId: getEnv().AUTH_GOOGLE_ID, clientSecret: getEnv().AUTH_GOOGLE_SECRET })]
      : []),
  ],
  callbacks: {
    /**
     * Google: decide here (refuse → back to the sign-in page with the reason). The guest cart joins the account and
     * the "signed in" / "account created" toast is queued exactly like the email + password actions do.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== GOOGLE_PROVIDER) return true;
      const identity = readGoogleProfile(profile);
      if (!identity) return googleRefused("failed");
      const result = await resolveGoogleSignIn(identity, await visitorLocale());
      if (!result.ok) return googleRefused(result.reason);
      await mergeGuestCartOnSignIn(result.userId);
      await setFlash(result.isNew ? "registered" : "signedIn");
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === GOOGLE_PROVIDER) {
        // Google sign-in: the session is OUR account (joined or created in signIn above), read fresh from the database.
        const linked = await findUserByGoogleAccount(account.providerAccountId);
        if (!linked || linked.status !== "ACTIVE") return null;
        token.sub = linked.id;
        token.uid = linked.id;
        token.sv = linked.sessionVersion;
        token.role = linked.role;
        token.name = linked.name;
        token.email = linked.email;
        delete token.picture; // Google's avatar URL is not used by the site
        return token;
      }
      if (user) {
        // Sign-in: copy the authoritative values that authorize() just read from the DB.
        token.uid = user.id;
        token.sv = user.sessionVersion;
        token.role = user.role;
        return token;
      }
      const current = typeof token.uid === "string" ? await findUserAuthState(token.uid) : null;
      if (!isSessionValid(token, current)) return null;
      token.role = current.role; // role changes apply immediately
      token.name = current.name; // profile edits show at once
      token.email = current.email;
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});
