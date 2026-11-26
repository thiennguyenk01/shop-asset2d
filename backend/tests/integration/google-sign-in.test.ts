import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@backend/auth/password";
import type { GoogleIdentity } from "@backend/lib/auth/google";
import { resolveGoogleSignIn } from "@backend/modules/user/google-service";
import { setPassword } from "@backend/modules/user/service";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * "Continue with Google" (user choice 2026-11-26) against the dev database: create, sign in again, join an existing
 * account, refuse unverified / locked, two sign-ins at once; then the first password of an account made with Google.
 */
const tag = newTag();
const email = (label: string) => `it-${tag}-${label}@example.test`;
const google = (label: string, over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  sub: `it-${tag}-${label}-sub`,
  email: email(label),
  emailVerified: true,
  name: `IT ${label}`,
  ...over,
});
const userOf = (address: string) =>
  db().user.findUniqueOrThrow({
    where: { email: address },
    select: { id: true, role: true, passwordHash: true, emailVerifiedAt: true, sessionVersion: true, preferredLocale: true, accounts: { select: { provider: true, providerAccountId: true } } },
  });

afterAll(async () => {
  await cleanup(tag);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
  expect(await db().account.count({ where: { providerAccountId: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Google sign-in", () => {
  it("a new Google account creates a USER without a password, its email verified, joined to Google", async () => {
    const r = await resolveGoogleSignIn(google("new"), "en");
    expect(r).toMatchObject({ ok: true, isNew: true });
    const u = await userOf(email("new"));
    expect(r.ok && r.userId).toBe(u.id);
    expect(u).toMatchObject({ role: "USER", passwordHash: null, preferredLocale: "en" });
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.accounts).toEqual([{ provider: "google", providerAccountId: google("new").sub }]);

    // The same Google account again: the same shop account, nothing new.
    expect(await resolveGoogleSignIn(google("new"), "vi")).toEqual({ ok: true, userId: u.id, isNew: false });
    expect(await db().account.count({ where: { userId: u.id } })).toBe(1);
  });

  it("an email + password account with the same (verified) email is joined to Google and keeps its password", async () => {
    const existing = await createUser(tag, "pw");
    await db().user.update({ where: { id: existing.id }, data: { passwordHash: "$argon2id$placeholder" } });
    expect(await resolveGoogleSignIn(google("pw"), "vi")).toEqual({ ok: true, userId: existing.id, isNew: false });
    const u = await userOf(email("pw"));
    expect(u.passwordHash).toBe("$argon2id$placeholder");
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.accounts).toHaveLength(1);
  });

  it("an unverified Google email neither joins nor creates anything", async () => {
    const existing = await createUser(tag, "unverified");
    expect(await resolveGoogleSignIn(google("unverified", { emailVerified: false }), "vi")).toEqual({ ok: false, reason: "unverified" });
    expect(await resolveGoogleSignIn(google("nobody", { emailVerified: false }), "vi")).toEqual({ ok: false, reason: "unverified" });
    expect(await db().account.count({ where: { userId: existing.id } })).toBe(0);
    expect(await db().user.count({ where: { email: email("nobody") } })).toBe(0);
  });

  it("a locked account never signs in with Google, linked or not", async () => {
    const lockedUser = await createUser(tag, "locked");
    await db().user.update({ where: { id: lockedUser.id }, data: { status: "LOCKED" } });
    expect(await resolveGoogleSignIn(google("locked"), "vi")).toEqual({ ok: false, reason: "locked" });

    const r = await resolveGoogleSignIn(google("lockedlater"), "vi");
    if (!r.ok) throw new Error("create");
    await db().user.update({ where: { id: r.userId }, data: { status: "LOCKED" } });
    expect(await resolveGoogleSignIn(google("lockedlater"), "vi")).toEqual({ ok: false, reason: "locked" });
  });

  it("two first sign-ins at once make one account", async () => {
    const [a, b] = await Promise.all([resolveGoogleSignIn(google("race"), "vi"), resolveGoogleSignIn(google("race"), "vi")]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.userId).toBe(b.userId);
    expect([a.isNew, b.isNew].sort()).toEqual([false, true]);
    expect(await db().user.count({ where: { email: email("race") } })).toBe(1);
    expect(await db().account.count({ where: { providerAccountId: google("race").sub } })).toBe(1);
  });
});

describe("First password of an account made with Google", () => {
  it("can be set once, ends the other sessions, and is never overwritten that way", async () => {
    const r = await resolveGoogleSignIn(google("setpw"), "vi");
    if (!r.ok) throw new Error("create");
    const before = await userOf(email("setpw"));

    expect(await setPassword(r.userId, "mat-khau-moi-123")).toEqual({ ok: true, email: email("setpw") });
    const after = await userOf(email("setpw"));
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await verifyPassword(after.passwordHash!, "mat-khau-moi-123")).toBe(true);

    // It has a password now: setting another one without the current password is refused.
    expect(await setPassword(r.userId, "mat-khau-khac-456")).toEqual({ ok: false });
    expect(await verifyPassword((await userOf(email("setpw"))).passwordHash!, "mat-khau-moi-123")).toBe(true);
  });
});
