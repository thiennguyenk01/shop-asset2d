import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Ancient-style corner ornament (khung viền cổ). */
function Corner({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("pointer-events-none absolute size-5 text-gold-500/80", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M1 12V1h11" />
      <path d="M5 9V5h4" />
      <path d="M1 1l4 4" strokeWidth="1" />
    </svg>
  );
}

/**
 * Panel with a thin gold border and carved corners. Use for featured blocks, cards,
 * modals and the hero — not for every element (CLAUDE.md §9: no overuse of effects).
 */
export function OrnateFrame({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-gold-500/25 bg-ink-900/80 shadow-panel backdrop-blur-sm",
        className,
      )}
      {...props}
    >
      <Corner className="-top-px -left-px" />
      <Corner className="-top-px -right-px rotate-90" />
      <Corner className="-right-px -bottom-px rotate-180" />
      <Corner className="-bottom-px -left-px -rotate-90" />
      {children}
    </div>
  );
}
