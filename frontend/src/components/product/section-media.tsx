"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { MediaLightbox } from "./media-lightbox";
import { DemoOverlay, type GalleryImage } from "./product-gallery";

/** At most this many tiles (2 × 2); the last one shows "+N" for the rest. */
export const SECTION_TILES = 4;

/**
 * Preview media of one section of a pack (user request 2026-11-15: many pictures made the section very tall).
 * A 2 × 2 grid at most; the 4th tile says "+N" when there are more; every tile opens the full-screen viewer
 * with all of them.
 */
export function SectionMedia({ items, name }: { items: GalleryImage[]; name: string }) {
  const t = useTranslations("productPage");
  const tp = useTranslations("product");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const shown = items.slice(0, SECTION_TILES);
  const more = items.length - shown.length;

  const show = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 self-start" data-testid="section-media-grid">
        {shown.map((m, n) => {
          const last = n === shown.length - 1 && more > 0;
          return (
            <li
              key={m.src}
              className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-850 ring-1 ring-ivory-100/10"
            >
              <button
                type="button"
                onClick={() => show(n)}
                aria-label={last ? t("viewerMore", { count: more + 1 }) : t("viewerOpen", { index: n + 1 })}
                className="group block size-full cursor-zoom-in"
                data-testid="section-media-tile"
              >
                {m.video ? (
                  <>
                    <video
                      muted
                      loop
                      autoPlay
                      playsInline
                      preload="metadata"
                      aria-hidden="true"
                      className="pixelated size-full object-cover"
                    >
                      <source src={m.src} type={m.mimeType} />
                    </video>
                    {!last && (
                      <span className="absolute inset-0 grid place-items-center">
                        <Play aria-hidden="true" className="size-6 fill-ivory-100/90 text-ivory-100/90" />
                      </span>
                    )}
                  </>
                ) : (
                  <Image
                    src={m.src}
                    alt={`${name} (${n + 1})`}
                    width={m.width}
                    height={m.height}
                    unoptimized
                    loading="lazy"
                    className="pixelated size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
                {last && (
                  <span
                    className="absolute inset-0 grid place-items-center bg-ink-950/65 text-xl font-semibold text-ivory-100 tabular-nums"
                    data-testid="section-media-more"
                  >
                    +{more + 1}
                  </span>
                )}
              </button>
              {m.isPlaceholder && !last && <DemoOverlay label={tp("demoImage")} />}
            </li>
          );
        })}
      </ul>
      <MediaLightbox
        items={items}
        name={name}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
