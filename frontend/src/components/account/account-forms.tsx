"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FLASH_MESSAGE, takeFlash } from "@backend/lib/flash";
import { PASSWORD_MIN } from "@backend/lib/schemas/auth";
import type { AccountFormState } from "@backend/modules/user/account-actions";
import { Field, FormError, PasswordField, useClearPasswordsOnHide } from "./auth-forms";

type Action = (prev: AccountFormState, form: FormData) => Promise<AccountFormState>;
const INITIAL: AccountFormState = { status: "idle" };

/** One toast per successful save (savedAt changes on every success). */
function useSavedToast(state: AccountFormState, message: string) {
  const { toast } = useToast();
  const shown = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.status !== "success" || !state.savedAt || shown.current === state.savedAt) return;
    shown.current = state.savedAt;
    toast({ variant: "success", title: message });
  }, [state, message, toast]);
}

export function ProfileForm({ action, name, email }: { action: Action; name: string; email: string }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  useSavedToast(state, t("saved"));

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="profile-form">
      {state.error && <FormError message={t(`errors.${state.error}`)} />}
      <Field
        label={ta("name")}
        name="name"
        autoComplete="name"
        required
        defaultValue={state.values?.name ?? name}
        error={state.fields?.name && ta(`errors.${state.fields.name}`)}
      />
      <Field label={ta("email")} name="email-readonly" type="email" value={email} readOnly disabled hint={t("emailNote")} className="cursor-not-allowed opacity-70" />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

/** Success arrives as a flash (see change-password action): take it here if <FlashToast /> has not. */
function useFlashOnSuccess(state: AccountFormState) {
  const t = useTranslations();
  const { toast } = useToast();
  useEffect(() => {
    if (state.status !== "success") return;
    const key = takeFlash();
    if (key) toast({ variant: "success", title: t(FLASH_MESSAGE[key]) });
  }, [state, t, toast]);
}

export function ChangePasswordForm({ action }: { action: Action }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useClearPasswordsOnHide(ref);
  useFlashOnSuccess(state);
  const err = (field: string) => state.fields?.[field] && ta(`errors.${state.fields[field]}`);

  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-col gap-4" data-testid="password-form">
      {state.error && <FormError message={t(`errors.${state.error}`, { minutes: state.retryMinutes ?? 1 })} />}
      <PasswordField
        label={t("currentPassword")}
        name="currentPassword"
        autoComplete="current-password"
        show={ta("showPassword")}
        hide={ta("hidePassword")}
        error={err("currentPassword")}
      />
      <PasswordField
        label={t("newPassword")}
        name="newPassword"
        autoComplete="new-password"
        hint={ta("passwordHint", { min: PASSWORD_MIN })}
        show={ta("showPassword")}
        hide={ta("hidePassword")}
        error={err("newPassword")}
      />
      <PasswordField
        label={t("confirmNewPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        show={ta("showPassword")}
        hide={ta("hidePassword")}
        error={err("confirmPassword")}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("changing") : t("changePassword")}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Set a password" (user choice 2026-11-26): an account created with Google has none yet, so there is no current
 * password to ask for. Success arrives as a flash like a change (the session cookie is re-issued).
 */
export function SetPasswordForm({ action }: { action: Action }) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useClearPasswordsOnHide(ref);
  useFlashOnSuccess(state);
  const err = (field: string) => state.fields?.[field] && ta(`errors.${state.fields[field]}`);

  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-col gap-4" data-testid="set-password-form">
      {state.error && <FormError message={t(`errors.${state.error}`, { minutes: state.retryMinutes ?? 1 })} />}
      <PasswordField
        label={t("newPassword")}
        name="password"
        autoComplete="new-password"
        hint={ta("passwordHint", { min: PASSWORD_MIN })}
        show={ta("showPassword")}
        hide={ta("hidePassword")}
        error={err("password")}
      />
      <PasswordField
        label={t("confirmNewPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        show={ta("showPassword")}
        hide={ta("hidePassword")}
        error={err("confirmPassword")}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("setPassword.submitting") : t("setPassword.submit")}
        </Button>
      </div>
    </form>
  );
}
