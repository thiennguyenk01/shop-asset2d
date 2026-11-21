import { z } from "zod";

/**
 * Account form rules, shared by the forms (client) and the server actions (CLAUDE.md §2: Zod for both).
 * Messages are translation keys under `auth.errors`, never display text.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 50;

export type AuthErrorKey =
  | "emailInvalid"
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "nameRequired"
  | "nameTooLong"
  | "passwordSame";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "emailInvalid" satisfies AuthErrorKey }).max(254, { error: "emailInvalid" }));

const displayName = z
  .string()
  .trim()
  .min(1, { error: "nameRequired" satisfies AuthErrorKey })
  .max(NAME_MAX, { error: "nameTooLong" satisfies AuthErrorKey });

const newPassword = z
  .string()
  .min(PASSWORD_MIN, { error: "passwordTooShort" satisfies AuthErrorKey })
  .max(PASSWORD_MAX, { error: "passwordTooLong" satisfies AuthErrorKey });

export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { error: "passwordRequired" satisfies AuthErrorKey })
    .max(PASSWORD_MAX, { error: "passwordTooLong" }),
});

export const registerSchema = z
  .object({
    name: displayName,
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "passwordMismatch" satisfies AuthErrorKey });

export const profileSchema = z.object({ name: displayName });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: "passwordRequired" satisfies AuthErrorKey })
      .max(PASSWORD_MAX, { error: "passwordTooLong" }),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], error: "passwordMismatch" satisfies AuthErrorKey })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], error: "passwordSame" satisfies AuthErrorKey });

/** "Forgot password" (GĐ6.2): only the email. */
export const forgotPasswordSchema = z.object({ email });

/** New password from a reset link (GĐ6.2): same rules as at sign-up. */
export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], error: "passwordMismatch" satisfies AuthErrorKey });

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** First error key per field, for showing next to the inputs. */
export function fieldErrors(error: z.ZodError): Partial<Record<string, AuthErrorKey>> {
  const out: Partial<Record<string, AuthErrorKey>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    out[field] ??= issue.message as AuthErrorKey;
  }
  return out;
}
