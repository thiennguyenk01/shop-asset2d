"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { revokeGiftAction } from "@backend/modules/user/admin-actions";

/** Take a gifted pack back (GĐ5.5, DECISIONS #34): only shown on ADMIN_GRANT lines that are still active. */
export function RevokeGiftButton({ userId, productId, title }: { userId: string; productId: string; title: string }) {
  const t = useTranslations("adminUsers");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const revoke = () =>
    startTransition(async () => {
      try {
        const r = await revokeGiftAction(userId, productId);
        setOpen(false);
        if (r.ok) toast({ variant: "success", title: t("giftRevoked", { title }) });
        else toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
      } catch {
        toast({ variant: "error", title: t("errors.generic") });
      }
    });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-cinnabar-500 light:text-cinnabar-600"
        disabled={pending}
        onClick={() => setOpen(true)}
        data-testid="gift-revoke"
      >
        {t("revokeGift")}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => !pending && setOpen(o)}
        title={t("revokeGiftTitle")}
        description={t("revokeGiftText", { title })}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
            disabled={pending}
            onClick={revoke}
            data-testid="gift-revoke-confirm"
          >
            {t("revokeGift")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
