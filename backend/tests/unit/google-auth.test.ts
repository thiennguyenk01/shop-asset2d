import { describe, expect, it } from "vitest";
import { googleErrorFromParam, planGoogleSignIn, readGoogleProfile, type GoogleIdentity } from "@backend/lib/auth/google";

/** "Continue with Google" (user choice 2026-11-26). */
describe("readGoogleProfile", () => {
  it("keeps Google's id, a lower-cased email, whether Google verified it, and the name", () => {
    expect(readGoogleProfile({ sub: "1234", email: " Ana@Gmail.COM ", email_verified: true, name: " Ana Lê " })).toEqual({
      sub: "1234",
      email: "ana@gmail.com",
      emailVerified: true,
      name: "Ana Lê",
    });
  });

  it("only a real true counts as verified; no name is fine", () => {
    expect(readGoogleProfile({ sub: "1", email: "a@b.co", email_verified: "true" })?.emailVerified).toBe(false);
    expect(readGoogleProfile({ sub: "1", email: "a@b.co" })).toMatchObject({ emailVerified: false, name: null });
  });

  it("refuses a profile without a usable id or email", () => {
    for (const p of [null, "x", {}, { sub: "1" }, { email: "a@b.co" }, { sub: "", email: "a@b.co" }, { sub: "1", email: "not-an-email" }, { sub: "x".repeat(256), email: "a@b.co" }]) {
      expect(readGoogleProfile(p)).toBeNull();
    }
  });
});

describe("planGoogleSignIn", () => {
  const verified: GoogleIdentity = { sub: "g1", email: "a@b.co", emailVerified: true, name: "A" };
  const unverified: GoogleIdentity = { ...verified, emailVerified: false };
  const active = (id: string) => ({ id, status: "ACTIVE" as const });
  const locked = (id: string) => ({ id, status: "LOCKED" as const });

  it("the account already linked to this Google account signs in, even if Google's email is unverified", () => {
    expect(planGoogleSignIn(verified, active("u1"), null)).toEqual({ kind: "signIn", userId: "u1" });
    expect(planGoogleSignIn(unverified, active("u1"), active("u2"))).toEqual({ kind: "signIn", userId: "u1" });
  });

  it("an account with the same email is joined to Google when Google verified the email", () => {
    expect(planGoogleSignIn(verified, null, active("u2"))).toEqual({ kind: "link", userId: "u2" });
  });

  it("no account yet: a new one is created", () => {
    expect(planGoogleSignIn(verified, null, null)).toEqual({ kind: "create" });
  });

  it("an unverified Google email never joins nor creates an account", () => {
    expect(planGoogleSignIn(unverified, null, active("u2"))).toEqual({ kind: "refuse", reason: "unverified" });
    expect(planGoogleSignIn(unverified, null, null)).toEqual({ kind: "refuse", reason: "unverified" });
  });

  it("a locked account never signs in with Google", () => {
    expect(planGoogleSignIn(verified, locked("u1"), null)).toEqual({ kind: "refuse", reason: "locked" });
    expect(planGoogleSignIn(verified, null, locked("u2"))).toEqual({ kind: "refuse", reason: "locked" });
  });
});

describe("googleErrorFromParam", () => {
  it("reads our own google-<reason> values", () => {
    expect(googleErrorFromParam("google-unverified")).toBe("unverified");
    expect(googleErrorFromParam("google-locked")).toBe("locked");
    expect(googleErrorFromParam("google-paused")).toBe("paused");
    expect(googleErrorFromParam(["google-failed"])).toBe("failed");
  });
  it("any other error from the sign-in library is a generic failure; no error is nothing", () => {
    expect(googleErrorFromParam("AccessDenied")).toBe("failed");
    expect(googleErrorFromParam("google-whatever")).toBe("failed");
    expect(googleErrorFromParam(undefined)).toBeNull();
    expect(googleErrorFromParam("")).toBeNull();
    expect(googleErrorFromParam("x".repeat(65))).toBeNull();
  });
});
