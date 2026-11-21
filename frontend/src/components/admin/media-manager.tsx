"use client";

import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  deleteMediaAction,
  moveMediaAction,
  setCoverAction,
  type MediaActionResult,
} from "@backend/modules/product/admin-media-actions";
import { Uploader } from "./uploader";

/** Square icon buttons small enough for four in a card of the 2-column phone grid. */
const ICON_BUTTON = "h-8 w-7 shrink-0 justify-center px-0 sm:w-8";

export type ManagedMedia = {
  id: string;
  kind: "THUMBNAIL" | "IMAGE" | "GIF" | "VIDEO";
  url: string;
  isPlaceholder: boolean;
};

/**
 * A gallery in the Admin (GĐ5.3): the pack overview (with its cover) or one section. Order = order on the
 * product page; the cover is always first and is the picture on the shop cards.
 */
export function MediaManager({
  productId,
  sectionId,
  items,
  withCover,
}: {
  productId: string;
  sectionId?: string;
  items: ManagedMedia[];
  withCover: boolean;
}) {
  const t = useTranslations("adminMedia");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<ManagedMedia | null>(null);

  const run = (fn: () => Promise<MediaActionResult>, success?: string) =>
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
        else if (success) toast({ variant: "success", title: success });
      } catch {
        toast({ variant: "error", title: t("errors.generic") });
      }
    });

  const firstMovable = withCover && items[0]?.kind === "THUMBNAIL" ? 1 : 0;

  return (
    <div className="flex flex-col gap-3" data-testid={sectionId ? "section-media" : "pack-media"}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <ul className="contents">
          {items.map((m, i) => {
            const isCover = m.kind === "THUMBNAIL";
            return (
              <li
                key={m.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border bg-ink-950/40",
                  isCover ? "border-gold-500" : "border-bronze-700",
                )}
                data-testid="media-item"
                data-kind={m.kind}
              >
                <div className="relative aspect-[4/3] bg-ink-850">
                  {m.kind === "VIDEO" ? (
                    <video src={m.url} muted playsInline preload="metadata" className="size-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview of pixel art, never resized
                    <img src={m.url} alt="" loading="lazy" className="pixelated size-full object-cover" />
                  )}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    {isCover && <Badge variant="premium">{t("cover")}</Badge>}
                    {m.kind === "VIDEO" && <Badge variant="neutral">{t("video")}</Badge>}
                    {m.kind === "GIF" && <Badge variant="neutral">GIF</Badge>}
                    {m.isPlaceholder && <Badge variant="demo">{t("demo")}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 p-1">
                  <Button
                    size="sm"
                    className={ICON_BUTTON}
                    variant="ghost"
                    aria-label={t("moveUp")}
                    disabled={pending || i <= firstMovable || isCover}
                    onClick={() => run(() => moveMediaAction(productId, m.id, "up"))}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    className={ICON_BUTTON}
                    variant="ghost"
                    aria-label={t("moveDown")}
                    disabled={pending || i === items.length - 1 || isCover}
                    onClick={() => run(() => moveMediaAction(productId, m.id, "down"))}
                  >
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                  {withCover && !isCover && m.kind !== "VIDEO" && (
                    <Button
                      size="sm"
                      className={ICON_BUTTON}
                      variant="ghost"
                      aria-label={t("makeCover")}
                      disabled={pending}
                      onClick={() => run(() => setCoverAction(productId, m.id), t("coverSaved"))}
                      data-testid="media-cover"
                    >
                      <Star aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className={cn(ICON_BUTTON, "ml-auto text-cinnabar-500 light:text-cinnabar-600")}
                    variant="ghost"
                    aria-label={t("delete")}
                    disabled={pending}
                    onClick={() => setConfirm(m)}
                    data-testid="media-delete"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <Uploader
          productId={productId}
          target="media"
          sectionId={sectionId ?? null}
          multiple
          tile
          testId={sectionId ? "section-media-upload" : "pack-media-upload"}
        />
      </div>

      <Modal
        open={confirm !== null}
        onOpenChange={(o) => !pending && !o && setConfirm(null)}
        title={t("deleteTitle")}
        description={confirm?.kind === "THUMBNAIL" ? t("deleteCoverText") : t("deleteText")}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
            disabled={pending}
            onClick={() => {
              const target = confirm;
              setConfirm(null);
              if (target) run(() => deleteMediaAction(productId, target.id), t("deleted"));
            }}
            data-testid="media-delete-confirm"
          >
            {t("deleteConfirm")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm(null)}>
            {t("cancel")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
