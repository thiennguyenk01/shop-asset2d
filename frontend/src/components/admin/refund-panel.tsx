"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { REFUND_REASON_MAX } from "@backend/lib/admin/order-rules";
import { refundOrderAction, type RefundFormState } from "@backend/modules/order/admin-actions";
import { TextArea } from "./fields";

const INITIAL: RefundFormState = { status: "idle" };
const FIELD_ERRORS = new Set(["reasonRequired", "reasonTooLong"]);

/**
 * Refund of a whole PAID order (GĐ5.4, DECISIONS #33): one step — the Admin writes a reason and confirms.
 * The server re-checks everything; after success the page refreshes and shows the order as refunded.
 * The panel stays mounted when the order cannot be refunded (`blocked`: it shows why instead of the button), so the
 * success toast is not lost when the refresh replaces the button.
 */
export function RefundPanel({
  code,
  amount,
  isDemo,
  blocked,
}: {
  code: string;
  amount: string;
  isDemo: boolean;
  blocked: { reason: string; text: string } | null;
}) {
  const t = useTranslations("adminOrders");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(refundOrderAction.bind(null, code), INITIAL);
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      setOpen(false);
      toast({ variant: "success", title: t("refunded", { code }) });
    }
  }, [state, t, toast, code]);

  const fieldError = state.status === "error" && state.error && FIELD_ERRORS.has(state.error) ? state.error : null;
  const formError = state.status === "error" && state.error && !FIELD_ERRORS.has(state.error) ? state.error : null;

  if (blocked) {
    return (
      <p className="text-sm text-pretty text-ivory-500" data-testid="refund-blocked" data-reason={blocked.reason}>
        {blocked.text}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="refund-panel">
      <Button
        variant="secondary"
        className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
        onClick={() => setOpen(true)}
        data-testid="refund-open"
      >
        <Undo2 aria-hidden="true" className="size-4" />
        {t("refund")}
      </Button>
      <p className="text-xs text-pretty text-ivory-500">{t("refundHint")}</p>

      <Modal
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title={t("refundTitle", { code })}
        description={t("refundText", { amount })}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="refund-form">
          {formError && <FormError message={t(`errors.${formError}` as "errors.generic")} />}
          <p className="text-sm text-pretty text-ivory-300">{isDemo ? t("refundDemoNote") : t("refundMoneyNote")}</p>
          <TextArea
            label={t("reason")}
            name="reason"
            defaultValue={state.values?.reason ?? ""}
            hint={t("reasonHint", { max: REFUND_REASON_MAX })}
            error={fieldError ? t(`errors.${fieldError}` as "errors.generic", { max: REFUND_REASON_MAX }) : undefined}
            maxLength={REFUND_REASON_MAX}
            rows={3}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="submit"
              variant="secondary"
              className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
              disabled={pending}
              aria-busy={pending || undefined}
              data-testid="refund-confirm"
            >
              {pending ? t("refunding") : t("refundConfirm")}
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
