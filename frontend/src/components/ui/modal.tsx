"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible modal (Radix Dialog): focus trap, Esc to close, scroll lock.
 * `closeLabel` comes from translations (CLAUDE.md §8 — no hardcoded UI text).
 */
export function Modal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  closeLabel,
  children,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-gold-500/30 bg-ink-900 p-6 shadow-panel focus:outline-none",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="font-heading text-xl text-ivory-100">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-ivory-300">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={closeLabel}
              className="rounded-md p-1 text-ivory-500 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
