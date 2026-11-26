import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * On / off switch: a real checkbox (`role="switch"`, posts "on" like any checkbox, keyboard and screen readers
 * as usual) laid invisibly over a track with a sliding knob, so a click on the track hits the checkbox itself;
 * jade when on. The label text sits to the right.
 */
export function Switch({
  label,
  className,
  ...props
}: { label: ReactNode } & Omit<ComponentProps<"input">, "type" | "role">) {
  return (
    <label
      className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ivory-300 select-none", className)}
    >
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
          {...props}
        />
        <span
          aria-hidden="true"
          className="inline-flex size-full items-center rounded-full border border-bronze-600 bg-ink-850 transition-colors peer-checked:border-jade-500 peer-checked:bg-jade-600 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/40 peer-disabled:opacity-50 after:ml-0.5 after:size-[18px] after:rounded-full after:bg-ivory-500 after:transition-transform after:content-[''] peer-checked:after:translate-x-5 peer-checked:after:bg-paper"
        />
      </span>
      {label}
    </label>
  );
}
