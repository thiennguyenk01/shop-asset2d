"use client";

import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

/** Tooltip. `content` must come from translations. Wrap the app once in <TooltipProvider>. */
export const TooltipProvider = RadixTooltip.Provider;

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Root delayDuration={250}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-70 max-w-xs rounded-md border border-gold-500/30 bg-ink-850 px-2.5 py-1.5 text-xs text-ivory-100 shadow-panel"
        >
          {content}
          <RadixTooltip.Arrow className="fill-ink-850" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
