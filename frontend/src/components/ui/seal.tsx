import { cn } from "@/lib/cn";

const sizes = {
  sm: "w-7 text-[0.95rem] py-1",
  md: "w-10 text-[1.35rem] py-1.5",
  lg: "w-16 text-[2.2rem] py-2.5",
} as const;

/**
 * Red cinnabar seal (con dấu đỏ). One glyph is centred; several glyphs stack vertically,
 * like a traditional name seal. Decorative only (aria-hidden).
 * Glyphs must exist in the Ma Shan Zheng subset — see frontend/src/fonts/README.md.
 */
export function Seal({ glyphs, size = "md", className }: { glyphs: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 flex-col items-center justify-center rounded-[3px] bg-cinnabar-600 font-han leading-[1.05] text-paper",
        "shadow-[inset_0_0_0_2px_var(--color-cinnabar-600),inset_0_0_0_3.5px_rgb(243_234_216/0.8),0_3px_12px_-3px_rgb(168_40_31/0.7)]",
        sizes[size],
        className,
      )}
    >
      {[...glyphs].map((g, i) => (
        <span key={i}>{g}</span>
      ))}
    </span>
  );
}
