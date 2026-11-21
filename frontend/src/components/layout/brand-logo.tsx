import { getTranslations } from "next-intl/server";
import { Seal } from "@/components/ui/seal";
import { Link } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Logo: single-glyph cinnabar seal 仙 + calligraphy brand name.
 * Small screens: the name wraps onto two lines ("Asset Game" / "MMORPG 2D") and the tagline is hidden,
 * so nothing is clipped (clipping would also cut Vietnamese diacritics — CLAUDE.md §9).
 */
/** `stacked`: always two lines (used in the 16rem sidebar, where one line would be clipped); fades out when the sidebar collapses. */
export async function BrandLogo({ className, stacked }: { className?: string; stacked?: boolean }) {
  const t = await getTranslations("brand");
  return (
    <Link href="/shop" aria-label={t("homeLink")} className={cn("group flex items-center gap-2 sm:gap-2.5", className)}>
      <Seal
        glyphs="仙"
        size="md"
        className="w-8 text-[1.1rem] transition-transform group-hover:-rotate-3 sm:w-10 sm:text-[1.35rem]"
      />
      {/* In the collapsible sidebar the name keeps its width and fades, so only the seal is left when collapsed. */}
      <span className={cn("flex flex-col", stacked && "shrink-0 transition-opacity duration-150 sidebar-collapsed:opacity-0")}>
        <span
          className={cn(
            "max-w-[7.5rem] font-display text-lg leading-[1.05] font-bold text-gold-gradient",
            stacked ? "max-w-[9rem] text-xl leading-[1.1]" : "sm:max-w-none sm:text-2xl sm:leading-tight sm:whitespace-nowrap",
          )}
        >
          {t("name")}
        </span>
        <span className={cn("mt-1 hidden text-xs leading-tight font-medium tracking-[0.12em] whitespace-nowrap text-ivory-500 uppercase", !stacked && "sm:block")}>
          {t("tagline")}
        </span>
      </span>
    </Link>
  );
}
