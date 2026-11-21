"use client";

import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ADMIN_NOTE_MAX } from "@backend/lib/admin/user-rules";
import { lockUserAction, unlockUserAction, type AdminUserFormState } from "@backend/modules/user/admin-actions";
import { TextArea } from "./fields";

const INITIAL: AdminUserFormState = { status: "idle" };
const FIELD_ERRORS = new Set(["reasonRequired", "tooLong"]);

/**
 * Lock / unlock an account (GĐ5.5, DECISIONS #34). Locking needs a reason and signs the customer out everywhere
 * (sessionVersion). Always mounted — whatever the account's state — so a success toast survives the page refresh.
 */
export function UserLockPanel({
  userId,
  status,
  blocked,
}: {
  userId: string;
  status: "ACTIVE" | "LOCKED";
  /** Why this Admin cannot lock this account (an Admin, oneself) — null when locking is possible. */
  blocked: string | null;
}) {
  const t = useTranslations("adminUsers");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [lockState, lockAction, locking] = useActionState(lockUserAction.bind(null, userId), INITIAL);
  const [unlockState, unlockAction, unlocking] = useActionState(unlockUserAction.bind(null, userId), INITIAL);
  const pending = locking || unlocking;
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    for (const [s, title] of [
      [lockState, t("locked")],
      [unlockState, t("unlocked")],
    ] as const) {
      if (s.status === "success" && s.savedAt && shown.current !== s.savedAt) {
        shown.current = s.savedAt;
        setOpen(false);
        toast({ variant: "success", title });
      }
    }
  }, [lockState, unlockState, t, toast]);

  const isLocked = status === "LOCKED";
  const state = isLocked ? unlockState : lockState;
  const errorKey = state.status === "error" ? state.error : undefined;
  const fieldError = errorKey && FIELD_ERRORS.has(errorKey) ? errorKey : null;
  const formError = errorKey && !FIELD_ERRORS.has(errorKey) ? errorKey : null;

  if (!isLocked && blocked) {
    return (
      <p className="text-sm text-pretty text-ivory-500" data-testid="lock-blocked">
        {blocked}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="lock-panel" data-status={status}>
      <Button
        variant="secondary"
        className={isLocked ? undefined : "border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"}
        onClick={() => setOpen(true)}
        data-testid={isLocked ? "unlock-open" : "lock-open"}
      >
        {isLocked ? <LockOpen aria-hidden="true" className="size-4" /> : <Lock aria-hidden="true" className="size-4" />}
        {isLocked ? t("unlock") : t("lock")}
      </Button>
      <p className="text-xs text-pretty text-ivory-500">{isLocked ? t("unlockHint") : t("lockHint")}</p>

      <Modal
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title={isLocked ? t("unlockTitle") : t("lockTitle")}
        description={isLocked ? t("unlockText") : t("lockText")}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <form
          action={isLocked ? unlockAction : lockAction}
          noValidate
          className="flex flex-col gap-4"
          data-testid={isLocked ? "unlock-form" : "lock-form"}
        >
          {formError && <FormError message={t(`errors.${formError}` as "errors.generic")} />}
          <TextArea
            key={isLocked ? "note" : "reason"}
            label={isLocked ? t("note") : t("reason")}
            name={isLocked ? "note" : "reason"}
            defaultValue={state.values?.[isLocked ? "note" : "reason"] ?? ""}
            hint={isLocked ? t("noteHint", { max: ADMIN_NOTE_MAX }) : t("reasonHint", { max: ADMIN_NOTE_MAX })}
            error={fieldError ? t(`errors.${fieldError}` as "errors.generic", { max: ADMIN_NOTE_MAX }) : undefined}
            maxLength={ADMIN_NOTE_MAX}
            rows={3}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="submit"
              variant="secondary"
              className={isLocked ? undefined : "border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"}
              disabled={pending}
              aria-busy={pending || undefined}
              data-testid={isLocked ? "unlock-confirm" : "lock-confirm"}
            >
              {pending ? t("saving") : isLocked ? t("unlockConfirm") : t("lockConfirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
