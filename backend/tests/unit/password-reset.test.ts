import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@backend/lib/auth/callback";
import {
  hashResetToken,
  isResetTokenShape,
  newResetToken,
  RESET_TTL_MINUTES,
  resetExpiry,
  resetPath,
} from "@backend/lib/auth/password-reset";
import { fieldErrors, forgotPasswordSchema, resetPasswordSchema } from "@backend/lib/schemas/auth";

/** GĐ6.2 — forgot / reset password: the link token, the forms, and where the sign-in goes back to. */
describe("reset link token", () => {
  it("is random, 43 URL-safe characters, and only its SHA-256 is stored", () => {
    const a = newResetToken();
    const b = newResetToken();
    expect(a.token).not.toBe(b.token);
    expect(isResetTokenShape(a.token)).toBe(true);
    expect(a.tokenHash).toBe(hashResetToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("rejects anything else before touching the database", () => {
    for (const t of ["", "__none__", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`, `${"a".repeat(42)}=`])
      expect(isResetTokenShape(t), t).toBe(false);
  });

  it("lasts 30 minutes and opens the reset page in the customer's language", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(RESET_TTL_MINUTES).toBe(30);
    expect(resetExpiry(now).toISOString()).toBe("2026-11-20T10:30:00.000Z");
    expect(resetPath("zh", "tok")).toBe("/zh/reset-password/tok");
  });
});

describe("forgot / reset forms", () => {
  it("forgot: a valid email, trimmed and lower-cased", () => {
    expect(forgotPasswordSchema.parse({ email: "  Khach@Example.TEST " }).email).toBe("khach@example.test");
    const bad = forgotPasswordSchema.safeParse({ email: "khong-phai-email" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error).email).toBe("emailInvalid");
  });

  it("reset: same password rules as sign-up, and both fields must match", () => {
    const err = (password: string, confirmPassword: string) => {
      const r = resetPasswordSchema.safeParse({ password, confirmPassword });
      return r.success ? {} : fieldErrors(r.error);
    };
    expect(err("matkhau-moi-123", "matkhau-moi-123")).toEqual({});
    expect(err("ngan", "ngan").password).toBe("passwordTooShort");
    expect(err("x".repeat(129), "x".repeat(129)).password).toBe("passwordTooLong");
    expect(err("matkhau-moi-123", "matkhau-khac-123").confirmPassword).toBe("passwordMismatch");
  });
});

describe("after signing in", () => {
  it("never goes back to the forgot / reset pages (a reset URL carries its token)", () => {
    expect(safeCallbackPath("/vi/forgot-password")).toBe("/shop");
    expect(safeCallbackPath(`/en/reset-password/${"a".repeat(43)}`)).toBe("/shop");
    expect(safeCallbackPath("/vi/library")).toBe("/library");
  });
});
