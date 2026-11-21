import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { clientIp, loginSubjects } from "@backend/lib/rate-limit/rules";
import { checkRateLimit, clearRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { findUserAuthState, findUserForLogin } from "@backend/modules/user/repository";
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
 */

const credentialsSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/vi/login" },
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
  ],
  callbacks: {
    async jwt({ token, user }) {
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
