"use client";

import { ImageOff, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { MediaLightbox, MediaThumbButton } from "./media-lightbox";

export type GalleryImage = {
  src: string;
  width: number;
  height: number;
  isPlaceholder: boolean;
  video: boolean;
  mimeType: string;
};

/**
 * Pack preview gallery: large image + ONE scrollable row of small previews (it never grows taller with more
 * pictures, user request 2026-11-15); the large image opens the full-screen viewer. Pixel art is never smoothed
 * (unoptimized + `pixelated`), and placeholder images always carry the Demo overlay.
 * Video previews (MP4/WebM, GĐ5.3) play muted in a loop with controls; GIFs animate like any image.
 */
export function ProductGallery({
  images,
  alt,
  labels,
}: {
  images: GalleryImage[];
  alt: string;
  labels: { gallery: string; showImage: string[]; demoImage: string; noImage: string };
}) {
  const t = useTranslations("productPage");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const current = images[index];

  return (
    <div role="group" aria-label={labels.gallery} className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-ivory-100/10">
        {current?.video ? (
          <video
            key={current.src}
            controls
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`${alt} (${index + 1}/${images.length})`}
            className="pixelated size-full bg-ink-950 object-contain"
          >
            <source src={current.src} type={current.mimeType} />
          </video>
        ) : current ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("viewerOpen", { index: index + 1 })}
            className="group block size-full cursor-zoom-in"
            data-testid="gallery-open"
          >
            <Image
              key={current.src}
              src={current.src}
              alt={`${alt} (${index + 1}/${images.length})`}
              width={current.width}
              height={current.height}
              unoptimized
              priority
              className="pixelated size-full object-cover"
            />
            <span className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-ink-950/70 text-ivory-100 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 aria-hidden="true" className="size-4" />
            </span>
          </button>
        ) : (
          <div className="grid size-full place-items-center text-ivory-500">
            <ImageOff aria-hidden="true" className="size-10" />
            <span className="sr-only">{labels.noImage}</span>
          </div>
        )}
        {current?.isPlaceholder && <DemoOverlay label={labels.demoImage} />}
      </div>

      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" data-testid="gallery-strip">
          {images.map((img, i) => (
            <li key={img.src} className="w-[calc((100%-1.5rem)/4)] shrink-0">
              <MediaThumbButton
                item={img}
                active={i === index}
                label={labels.showImage[i]}
                onClick={() => setIndex(i)}
                className="w-full"
              />
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <MediaLightbox
          items={images}
          name={alt}
          index={index}
          onIndexChange={setIndex}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}

export function DemoOverlay({ label }: { label: string }) {
  return (
    <span className="absolute right-3 bottom-3 rounded-full bg-ink-950 px-2.5 py-0.5 text-xs font-medium text-ivory-100 ring-1 ring-ivory-500/40">
      {label}
    </span>
  );
}
