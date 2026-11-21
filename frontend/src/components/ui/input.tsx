import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-bronze-600 bg-ink-950/70 px-3 text-sm text-ivory-100",
        "placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30 focus:outline-none",
        "aria-[invalid=true]:border-cinnabar-500 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
