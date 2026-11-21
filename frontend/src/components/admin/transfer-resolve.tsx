"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { TRANSFER_NOTE_MAX } from "@backend/lib/admin/transfer-rules";
import { resolveTransferAction, type ResolveTransferState } from "@backend/modules/payment/admin-actions";
import { TextArea } from "./fields";

const INITIAL: ResolveTransferState = { status: "idle" };
const FIELD_ERRORS = new Set(["noteRequired", "noteTooLong"]);

/**
 * "Mark handled" for one bank transfer that settled nothing (DECISIONS #45): the Admin writes what was done
 * (contacted the buyer, refunded outside the site…) and confirms. It grants nothing and moves no money; the server
 * re-checks the Admin and logs the action.
 */
export function TransferResolveButton({ id, amount }: { id: string; amount: string }) {
  const t = useTranslations("adminTransfers");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(resolveTransferAction.bind(null, id), INITIAL);
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      setOpen(false);
      toast({ variant: "success", title: t("resolved") });
    }
  }, [state, t, toast]);

  const fieldError = state.status === "error" && state.error && FIELD_ERRORS.has(state.error) ? state.error : null;
  const formError = state.status === "error" && state.error && !FIELD_ERRORS.has(state.error) ? state.error : null;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="transfer-resolve-open">
        <CheckCheck aria-hidden="true" className="size-4" />
        {t("resolve")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title={t("resolveTitle")}
        description={t("resolveText", { amount })}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="transfer-resolve-form">
          {formError && <FormError message={t(`errors.${formError}` as "errors.generic")} />}
          <TextArea
            label={t("note")}
            name="note"
            defaultValue={state.values?.note ?? ""}
            hint={t("noteHint", { max: TRANSFER_NOTE_MAX })}
            error={fieldError ? t(`errors.${fieldError}` as "errors.generic", { max: TRANSFER_NOTE_MAX }) : undefined}
            maxLength={TRANSFER_NOTE_MAX}
            rows={3}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" disabled={pending} aria-busy={pending || undefined} data-testid="transfer-resolve-confirm">
              {pending ? t("resolving") : t("resolveConfirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
