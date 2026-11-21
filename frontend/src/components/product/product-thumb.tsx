import { ImageOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@backend/storage/media-url";

/**
 * Product image with the mandatory "Demo" overlay for placeholder media (CLAUDE.md §11).
 * Rendered unoptimized + `pixelated` so HD pixel art is never smoothed (CLAUDE.md §9). The label is smaller on narrow
 * pictures (two cards per row on phones) so it stays on one line.
 */
export function ProductThumb({
  thumbnail,
  alt,
  demoLabel,
  noImageLabel,
  className,
  priority,
}: {
  thumbnail: { key: string; isPlaceholder: boolean; width: number | null; height: number | null } | null;
  alt: string;
  demoLabel: string;
  noImageLabel: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("@container relative aspect-[4/3] overflow-hidden bg-ink-850", className)}>
      {thumbnail ? (
        <Image
          src={mediaUrl(thumbnail.key)}
          alt={alt}
          width={thumbnail.width ?? 800}
          height={thumbnail.height ?? 600}
          unoptimized
          priority={priority}
          sizes="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw"
          className="pixelated size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center text-ivory-500">
          <ImageOff aria-hidden="true" className="size-8" />
          <span className="sr-only">{noImageLabel}</span>
        </div>
      )}
      {thumbnail?.isPlaceholder && (
        <span className="absolute right-2 bottom-2 rounded-full bg-ink-950 px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-ivory-100 ring-1 ring-ivory-500/40 @[14rem]:right-3 @[14rem]:bottom-3 @[14rem]:px-2.5 @[14rem]:text-xs">
          {demoLabel}
        </span>
      )}
    </div>
  );
}
