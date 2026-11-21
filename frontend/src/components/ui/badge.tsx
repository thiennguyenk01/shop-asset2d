import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  free: "bg-jade-600 text-paper",
  premium: "[background-color:var(--color-gold-500)] bg-gradient-to-b from-gold-400 to-gold-600 text-soot",
  /** Placeholder / demo data marker (CLAUDE.md §11). */
  demo: "bg-ink-950/85 text-ivory-300 ring-1 ring-ivory-500/40",
  neutral: "bg-ink-950/85 text-ivory-100 ring-1 ring-ivory-100/10",
} as const;

export type BadgeVariant = keyof typeof variants;

export function Badge({ variant = "neutral", className, ...props }: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
