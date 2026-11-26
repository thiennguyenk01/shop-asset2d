"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { GoogleError } from "@backend/lib/auth/google";
import { FormError } from "./auth-forms";

/**
 * "Continue with Google" (user choice 2026-11-26), above the email form of the sign-in and sign-up pages, with an
 * "or" line under it. Rendered only when the shop's Google OAuth client is configured. `error`: why the last
 * Google attempt did not sign in (the sign-in page reads it from `?error=`).
 */
export function GoogleSignIn({ action, error }: { action: () => Promise<void>; error?: GoogleError | null }) {
  const t = useTranslations("auth.google");
  return (
    <div className="flex flex-col gap-4" data-testid="google-sign-in">
      {error && <FormError message={t(`errors.${error}`)} />}
      <form action={action}>
        <GoogleButton label={t("button")} pendingLabel={t("pending")} />
      </form>
      <div className="flex items-center gap-3 text-xs text-ivory-500" aria-hidden="true">
        <span className="h-px flex-1 bg-bronze-700" />
        {t("or")}
        <span className="h-px flex-1 bg-bronze-700" />
      </div>
    </div>
  );
}

function GoogleButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" variant="secondary" className="w-full" disabled={pending} aria-busy={pending || undefined} data-testid="google-button">
      <GoogleMark />
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Google's "G" in its own colours, as its sign-in branding asks. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-4 shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
