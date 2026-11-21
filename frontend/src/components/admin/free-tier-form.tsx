"use client";

import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FREE_TIER_OPEN_WORD } from "@backend/lib/admin/settings-rules";
import { setFreeTierAction, type FreeTierFormState } from "@backend/modules/settings/admin-actions";
import { TextField } from "./fields";

const INITIAL: FreeTierFormState = { status: "idle" };

/**
 * "Free plans only" (user choice 2026-11-22). On: the button turns it off, after typing OPEN. Off: one button turns
 * it back on. The page shows the current state; the action re-reads it from the database.
 */
export function FreeTierForm({ on }: { on: boolean }) {
  const t = useTranslations("adminSettings");
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(setFreeTierAction, INITIAL);
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: state.on ? t("freeTierSavedOn") : t("freeTierSavedOff") });
    }
  }, [state, t, toast]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="free-tier-form">
      <input type="hidden" name="freeTierOnly" value={on ? "false" : "true"} />
      {state.status === "error" && state.error && (
        <FormError message={t(`errors.${state.error}`, { word: FREE_TIER_OPEN_WORD })} />
      )}
      {on ? (
        <>
          <TextField
            label={t("freeTierConfirm", { word: FREE_TIER_OPEN_WORD })}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            hint={t("freeTierConfirmHint")}
            className="max-w-60 uppercase"
          />
          <Button type="submit" variant="danger" disabled={pending} aria-busy={pending || undefined} className="self-start" data-testid="free-tier-off">
            <LockKeyholeOpen aria-hidden="true" className="size-4" />
            {t("freeTierTurnOff")}
          </Button>
        </>
      ) : (
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="self-start" data-testid="free-tier-on">
          <LockKeyhole aria-hidden="true" className="size-4" />
          {t("freeTierTurnOn")}
        </Button>
      )}
    </form>
  );
}
