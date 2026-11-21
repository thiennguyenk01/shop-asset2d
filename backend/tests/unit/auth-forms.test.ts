import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeCallbackPath } from "@backend/lib/auth/callback";
import { changePasswordSchema, fieldErrors, loginSchema, profileSchema, registerSchema } from "@backend/lib/schemas/auth";

describe("safeCallbackPath", () => {
  it("keeps same-site paths and drops the locale prefix", () => {
    expect(safeCallbackPath("/product/tien-hiep-dao-mon")).toBe("/product/tien-hiep-dao-mon");
    expect(safeCallbackPath("/vi/shop?type=free")).toBe("/shop?type=free");
    expect(safeCallbackPath("/zh/cart")).toBe("/cart");
  });

  it("rejects other sites, odd input and the auth pages", () => {
    for (const bad of [
      undefined,
      "",
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "shop",
      "/vi/login",
      "/register",
      "/en",
      "/a\u0000b",
    ]) {
      expect(safeCallbackPath(bad)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });
});

describe("auth schemas", () => {
  it("normalises the email and accepts a valid login", () => {
    expect(loginSchema.parse({ email: "  Me@Example.COM ", password: "x" })).toEqual({ email: "me@example.com", password: "x" });
  });

  it("returns translation keys for each field", () => {
    const r = registerSchema.safeParse({ name: " ", email: "nope", password: "short", confirmPassword: "other" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrors(r.error)).toEqual({
        name: "nameRequired",
        email: "emailInvalid",
        password: "passwordTooShort",
        confirmPassword: "passwordMismatch",
      });
    }
  });

  it("accepts a valid registration", () => {
    const r = registerSchema.safeParse({ name: "Lâm Phong", email: "a@b.vn", password: "12345678", confirmPassword: "12345678" });
    expect(r.success).toBe(true);
  });
});

describe("account schemas", () => {
  it("profile name is trimmed and required", () => {
    expect(profileSchema.parse({ name: "  Vân Hà  " })).toEqual({ name: "Vân Hà" });
    expect(profileSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("change password: confirm must match and the new one must differ", () => {
    const mismatch = changePasswordSchema.safeParse({ currentPassword: "old-pass-1", newPassword: "new-pass-12", confirmPassword: "x" });
    expect(!mismatch.success && fieldErrors(mismatch.error)).toEqual({ confirmPassword: "passwordMismatch" });
    const same = changePasswordSchema.safeParse({ currentPassword: "same-pass-1", newPassword: "same-pass-1", confirmPassword: "same-pass-1" });
    expect(!same.success && fieldErrors(same.error)).toEqual({ newPassword: "passwordSame" });
    expect(changePasswordSchema.safeParse({ currentPassword: "old-pass-1", newPassword: "new-pass-12", confirmPassword: "new-pass-12" }).success).toBe(true);
  });
});
