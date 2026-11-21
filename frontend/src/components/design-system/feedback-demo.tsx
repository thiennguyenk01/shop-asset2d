"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

export function FeedbackDemo() {
  const t = useTranslations("designSystem");
  const tc = useTranslations("common");
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Modal
        trigger={<Button variant="secondary">{t("openModal")}</Button>}
        title={t("modalTitle")}
        description={t("modalText")}
        closeLabel={tc("close")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost">{t("cancel")}</Button>
          <Button>{t("buyNow")}</Button>
        </div>
      </Modal>
      <Button variant="jade" onClick={() => toast({ variant: "success", title: t("toastSuccess") })}>
        {t("showToastSuccess")}
      </Button>
      <Button
        variant="danger"
        onClick={() => toast({ variant: "error", title: t("toastError"), description: t("toastErrorText") })}
      >
        {t("showToastError")}
      </Button>
      <Tooltip content={t("tooltipText")}>
        <Button variant="ghost">
          <Info aria-hidden="true" />
          {t("tooltipTrigger")}
        </Button>
      </Tooltip>
    </div>
  );
}
