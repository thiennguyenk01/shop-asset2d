"use client";

import { ExternalLink, EyeOff, Plus, Rocket, Trash2, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Link } from "@backend/i18n/navigation";
import {
  createDraftAction,
  deleteProductAction,
  setProductStatusAction,
  type StatusActionResult,
} from "@backend/modules/product/admin-actions";

type Status = "DRAFT" | "PUBLISHED" | "HIDDEN";

/** next/navigation redirect() from an action surfaces as an error with this digest; it is not a failure. */
const isRedirect = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  "digest" in e &&
  String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

function useRun() {
  const t = useTranslations("adminProducts");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<StatusActionResult>, successTitle?: string) =>
    startTransition(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
        else if (r?.ok && successTitle) toast({ variant: "success", title: successTitle });
      } catch (e) {
        if (!isRedirect(e)) toast({ variant: "error", title: t("errors.generic") });
      }
    });
  return { pending, run };
}

/**
 * The pack's status moves, in the pack header (GĐ5.2; header since 2026-11-21): publish (only when nothing is
 * missing: the "ready to sell" panel says what), hide, show again, back to draft (never-published packs only),
 * and the link to the store page while on sale.
 */
export function PackStatusActions({
  productId,
  slug,
  status,
  canPublish,
  everPublished,
}: {
  productId: string;
  slug: string;
  status: Status;
  canPublish: boolean;
  everPublished: boolean;
}) {
  const t = useTranslations("adminProducts");
  const locale = useLocale();
  const { pending, run } = useRun();
  const setStatus = (s: Status) => run(() => setProductStatusAction(locale, productId, s), t("statusSaved"));

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="status-panel" data-status={status}>
      {status === "PUBLISHED" && (
        <Button asChild variant="ghost">
          <Link href={`/product/${slug}`} target="_blank" data-testid="view-in-store">
            <ExternalLink aria-hidden="true" className="size-4" />
            {t("viewInStore")}
          </Link>
        </Button>
      )}
      {status === "HIDDEN" && !everPublished && (
        <Button variant="ghost" disabled={pending} onClick={() => setStatus("DRAFT")}>
          <Undo2 aria-hidden="true" className="size-4" />
          {t("toDraft")}
        </Button>
      )}
      {status === "PUBLISHED" ? (
        <Button variant="secondary" disabled={pending} onClick={() => setStatus("HIDDEN")} data-testid="status-hide">
          <EyeOff aria-hidden="true" className="size-4" />
          {t("hide")}
        </Button>
      ) : (
        <Button
          variant="jade"
          disabled={pending || !canPublish}
          title={canPublish ? undefined : t("publishBlocked")}
          onClick={() => setStatus("PUBLISHED")}
          data-testid="status-publish"
        >
          <Rocket aria-hidden="true" className="size-4" />
          {status === "HIDDEN" ? t("unhide") : t("publish")}
        </Button>
      )}
    </div>
  );
}

/** Delete a pack (only one nobody bought / owns; otherwise hide it), with confirmation. */
export function PackDeleteButton({ productId, canDelete }: { productId: string; canDelete: boolean }) {
  const t = useTranslations("adminProducts");
  const locale = useLocale();
  const { pending, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {/* Under the "ready to sell" list, right of Save (2026-11-21); why it is off is said below the row. */}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || !canDelete}
        onClick={() => setConfirm(true)}
        className="text-cinnabar-500 light:text-cinnabar-600"
        data-testid="product-delete"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {t("deleteTitle")}
      </Button>
      <Modal
        open={confirm}
        onOpenChange={(o) => !pending && setConfirm(o)}
        title={t("deleteTitle")}
        description={t("deleteText")}
        closeLabel={t("deleteCancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
            disabled={pending}
            onClick={() => run(() => deleteProductAction(locale, productId))}
            data-testid="product-delete-confirm"
          >
            {t("deleteConfirm")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
            {t("deleteCancel")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** "New pack" on the list: creates an empty draft and opens its editor (2026-11-21). */
export function NewPackButton({ label }: { label: string }) {
  const locale = useLocale();
  const { pending, run } = useRun();
  return (
    <Button disabled={pending} aria-busy={pending || undefined} onClick={() => run(() => createDraftAction(locale))} data-testid="admin-product-new">
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
