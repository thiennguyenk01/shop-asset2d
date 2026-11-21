import { describe, expect, it } from "vitest";
import { isSessionValid, type UserAuthState } from "@backend/auth/session-validation";

const user: UserAuthState = { id: "u1", status: "ACTIVE", sessionVersion: 3, role: "USER" };

describe("isSessionValid (sessionVersion re-checked against DB state)", () => {
  it("accepts a token whose version matches the database", () => {
    expect(isSessionValid({ uid: "u1", sv: 3 }, user)).toBe(true);
  });

  it("rejects a token issued before a password change (version bumped in DB)", () => {
    expect(isSessionValid({ uid: "u1", sv: 2 }, user)).toBe(false);
  });

  it("rejects a token of a locked account even if the version matches", () => {
    expect(isSessionValid({ uid: "u1", sv: 3 }, { ...user, status: "LOCKED" })).toBe(false);
  });

  it("rejects when the user no longer exists", () => {
    expect(isSessionValid({ uid: "u1", sv: 3 }, null)).toBe(false);
  });

  it("rejects tokens missing claims or with mismatched user id", () => {
    expect(isSessionValid({}, user)).toBe(false);
    expect(isSessionValid({ uid: "u1" }, user)).toBe(false);
    expect(isSessionValid({ uid: "u1", sv: "3" }, user)).toBe(false);
    expect(isSessionValid({ uid: "u2", sv: 3 }, user)).toBe(false);
  });
});
