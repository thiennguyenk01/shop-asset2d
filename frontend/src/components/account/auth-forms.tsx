"use client";

import { AlertCircle, Eye, EyeOff, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";
import { PASSWORD_MIN } from "@backend/lib/schemas/auth";
import type { AuthFormState, ForgotFormState } from "@backend/modules/user/actions";

type Action = (prev: AuthFormState, form: FormData) => Promise<AuthFormState>;
const INITIAL: AuthFormState = { status: "idle" };

/**
 * Next 16 keeps up to 3 visited pages mounted but hidden (<Activity>, docs "preserving-ui-state"), DOM state
 * included. Clear typed passwords when the page is hidden, so they never linger in a hidden form or come back
 * with the browser's Back button. Email / name drafts may stay.
 */
export function useClearPasswordsOnHide(form: RefObject<HTMLFormElement | null>) {
  useLayoutEffect(() => {
    const el = form.current;
    return () => {
      el?.querySelectorAll<HTMLInputElement>("input[data-password]").forEach((i) => (i.value = ""));
    };
  }, [form]);
}

export function LoginForm({ action, callbackUrl }: { action: Action; callbackUrl?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useClearPasswordsOnHide(ref);

  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-col gap-4" data-testid="login-form">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.error && <FormError message={t(`errors.${state.error}`, { minutes: state.retryMinutes ?? 1 })} />}
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fields?.email && t(`errors.${state.fields.email}`)}
      />
      <PasswordField
        label={t("password")}
        name="password"
        autoComplete="current-password"
        show={t("showPassword")}
        hide={t("hidePassword")}
        error={state.fields?.password && t(`errors.${state.fields.password}`)}
      />
      <Link href="/forgot-password" className="-mt-1 self-end text-sm font-medium text-gold-300 underline-offset-4 hover:underline" data-testid="forgot-link">
        {t("login.forgotLink")}
      </Link>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}

const FORGOT_INITIAL: ForgotFormState = { status: "idle" };

/** "Forgot password" (GĐ6.2): one email field; afterwards the same answer whether or not the email has an account. */
export function ForgotPasswordForm({ action, minutes }: { action: (prev: ForgotFormState, form: FormData) => Promise<ForgotFormState>; minutes: number }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, FORGOT_INITIAL);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-4" data-testid="forgot-sent">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-jade-500/60 bg-jade-500/10 px-4 py-3.5">
          <MailCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-jade-400" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ivory-100">{t("forgot.sentTitle")}</p>
            <p className="text-sm text-pretty text-ivory-300">{t("forgot.sentText", { email: state.values?.email ?? "", minutes })}</p>
          </div>
        </div>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/login">{t("forgot.backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="forgot-form">
      {state.error && <FormError message={t(`errors.${state.error}`, { minutes: state.retryMinutes ?? 1 })} />}
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fields?.email && t(`errors.${state.fields.email}`)}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? t("forgot.submitting") : t("forgot.submit")}
      </Button>
    </form>
  );
}

/** New password from a reset link (GĐ6.2). A link that stopped working while the page was open shows the form error. */
export function ResetPasswordForm({ action }: { action: Action }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useClearPasswordsOnHide(ref);

  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-col gap-4" data-testid="reset-form">
      {state.error && (
        <div className="flex flex-col gap-2">
          <FormError message={t(`errors.${state.error}`)} />
          {state.error === "invalidLink" && (
            <Link href="/forgot-password" className="text-sm font-medium text-gold-300 underline-offset-4 hover:underline">
              {t("reset.requestNew")}
            </Link>
          )}
        </div>
      )}
      <PasswordField
        label={t("reset.newPassword")}
        name="password"
        autoComplete="new-password"
        hint={t("passwordHint", { min: PASSWORD_MIN })}
        show={t("showPassword")}
        hide={t("hidePassword")}
        error={state.fields?.password && t(`errors.${state.fields.password}`)}
      />
      <PasswordField
        label={t("confirmPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        show={t("showPassword")}
        hide={t("hidePassword")}
        error={state.fields?.confirmPassword && t(`errors.${state.fields.confirmPassword}`)}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? t("reset.submitting") : t("reset.submit")}
      </Button>
    </form>
  );
}

export function RegisterForm({ action, callbackUrl }: { action: Action; callbackUrl?: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useClearPasswordsOnHide(ref);

  return (
    <form ref={ref} action={formAction} noValidate className="flex flex-col gap-4" data-testid="register-form">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.error && <FormError message={t(`errors.${state.error}`, { minutes: state.retryMinutes ?? 1 })} />}
      <Field
        label={t("name")}
        name="name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fields?.name && t(`errors.${state.fields.name}`)}
      />
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fields?.email && t(`errors.${state.fields.email}`)}
      />
      <PasswordField
        label={t("password")}
        name="password"
        autoComplete="new-password"
        hint={t("passwordHint", { min: PASSWORD_MIN })}
        show={t("showPassword")}
        hide={t("hidePassword")}
        error={state.fields?.password && t(`errors.${state.fields.password}`)}
      />
      <PasswordField
        label={t("confirmPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        show={t("showPassword")}
        hide={t("hidePassword")}
        error={state.fields?.confirmPassword && t(`errors.${state.fields.confirmPassword}`)}
      />
      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? t("register.submitting") : t("register.submit")}
      </Button>
    </form>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-cinnabar-600/60 bg-cinnabar-700/10 px-3.5 py-3 text-sm text-ivory-100">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cinnabar-500" />
      {message}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-bronze-600 bg-ink-900 px-3.5 text-base text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25 aria-[invalid=true]:border-cinnabar-500";

export type FieldProps = ComponentProps<"input"> & { label: string; name: string; hint?: string; error?: string | false };

/** Label above, input, then hint or error (error replaces the hint; both are announced via aria-describedby). */
export function Field({ label, name, hint, error, className, children, ...props }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ivory-100">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={cn(inputClass, className)}
          {...props}
        />
        {children}
      </div>
      {error ? (
        <p id={noteId} className="text-xs text-cinnabar-500 light:text-cinnabar-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="text-xs text-ivory-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function PasswordField({ show, hide, ...props }: Omit<FieldProps, "type"> & { show: string; hide: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field {...props} type={visible ? "text" : "password"} required data-password="" className="pr-11">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hide : show}
        title={visible ? hide : show}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-ivory-500 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </Field>
  );
}
