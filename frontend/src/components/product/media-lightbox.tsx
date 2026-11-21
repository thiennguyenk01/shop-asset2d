"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import type { GalleryImage } from "./product-gallery";

/**
 * Full-screen viewer for a pack's preview media (overview gallery and each section): one item at a time,
 * contained (never cropped, pixel art not smoothed), previous / next buttons and ←/→ keys, a scrollable strip of
 * small previews, "3 / 12". Lets every list of pictures on the page stay short (user request 2026-11-15).
 */
export function MediaLightbox({
  items,
  name,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: {
  items: GalleryImage[];
  name: string;
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("productPage");
  const tp = useTranslations("product");
  const strip = useRef<HTMLUListElement>(null);
  const current = items[index];
  const go = (delta: number) => onIndexChange((index + delta + items.length) % items.length);

  // Keep the active small preview in view.
  useEffect(() => {
    if (!open) return;
    strip.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index, open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (items.length < 2) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/95 backdrop-blur-sm" />
        <Dialog.Content
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col gap-3 p-3 focus:outline-none sm:p-6"
          data-testid="media-lightbox"
        >
          <div className="flex items-center gap-3">
            <Dialog.Title className="min-w-0 flex-1 truncate py-1 text-sm font-medium text-ivory-100">
              {name}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-ivory-300 tabular-nums" data-testid="media-lightbox-counter">
              {t("viewerCounter", { index: index + 1, total: items.length })}
            </Dialog.Description>
            <Dialog.Close
              aria-label={t("viewerClose")}
              className="grid size-10 place-items-center rounded-full text-ivory-300 transition-colors hover:bg-ivory-100/10 hover:text-ivory-100"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {current &&
              (current.video ? (
                <video
                  key={current.src}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="pixelated max-h-full max-w-full rounded-lg"
                >
                  <source src={current.src} type={current.mimeType} />
                </video>
              ) : (
                <Image
                  key={current.src}
                  src={current.src}
                  alt={`${name} (${index + 1}/${items.length})`}
                  width={current.width}
                  height={current.height}
                  unoptimized
                  className="pixelated max-h-full w-auto max-w-full rounded-lg object-contain"
                  style={{ height: "auto" }}
                />
              ))}
            {current?.isPlaceholder && (
              <span className="absolute right-3 bottom-3 rounded-full bg-ink-950 px-2.5 py-0.5 text-xs font-medium text-ivory-100 ring-1 ring-ivory-500/40">
                {tp("demoImage")}
              </span>
            )}
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={t("viewerPrev")}
                  className="absolute top-1/2 left-0 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-ink-900/80 text-ivory-100 ring-1 ring-ivory-100/15 transition-colors hover:bg-ink-800"
                  data-testid="media-lightbox-prev"
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={t("viewerNext")}
                  className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-ink-900/80 text-ivory-100 ring-1 ring-ivory-100/15 transition-colors hover:bg-ink-800"
                  data-testid="media-lightbox-next"
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </button>
              </>
            )}
          </div>

          {items.length > 1 && (
            <ul ref={strip} className="flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {items.map((m, i) => (
                <li key={m.src} data-index={i} className="shrink-0">
                  <MediaThumbButton
                    item={m}
                    active={i === index}
                    label={t("showImage", { index: i + 1 })}
                    onClick={() => onIndexChange(i)}
                    className="w-20 sm:w-24"
                  />
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A small 4:3 preview button (image, or a video frame with a play mark). */
export function MediaThumbButton({
  item,
  active,
  label,
  onClick,
  className,
}: {
  item: GalleryImage;
  active?: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border-2 transition-colors",
        active ? "border-gold-400" : "border-transparent opacity-70 hover:opacity-100",
        className,
      )}
    >
      {item.video ? (
        <>
          <video
            src={item.src}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="pixelated size-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center bg-ink-950/30">
            <Play aria-hidden="true" className="size-5 fill-ivory-100 text-ivory-100" />
          </span>
        </>
      ) : (
        <Image
          src={item.src}
          alt=""
          width={item.width}
          height={item.height}
          unoptimized
          className="pixelated size-full object-cover"
        />
      )}
    </button>
  );
}
