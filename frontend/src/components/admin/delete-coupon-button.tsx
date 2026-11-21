"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteCouponAction } from "@backend/modules/coupon/admin-actions";

/** Delete a coupon nobody has used (GĐ5.6, DECISIONS #35). On success the action redirects to the list. */
export function DeleteCouponButton({ id, code }: { id: string; code: string }) {
  const t = useTranslations("adminCoupons");
  const locale = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      try {
        const r = await deleteCouponAction(locale, id);
        if (r && !r.ok) {
          setOpen(false);
          toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
        }
      } catch (e) {
        // redirect() after a successful delete surfaces as an error with this digest: it is not a failure.
        const redirected =
          typeof e === "object" &&
          e !== null &&
          "digest" in e &&
          String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
        if (!redirected) toast({ variant: "error", title: t("errors.generic") });
      }
    });

  return (
    <>
      <Button
        variant="ghost"
        className="self-start text-cinnabar-500 light:text-cinnabar-600"
        disabled={pending}
        onClick={() => setOpen(true)}
        data-testid="coupon-delete"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {t("delete")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title={t("deleteTitle", { code })}
        description={t("deleteText")}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
            disabled={pending}
            onClick={remove}
            data-testid="coupon-delete-confirm"
          >
            {t("delete")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
