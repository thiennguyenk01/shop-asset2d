"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children, labels }: { children: ReactNode; labels: { close: string; notifications: string } }) {
  return (
    <TooltipProvider>
      <ToastProvider closeLabel={labels.close} regionLabel={labels.notifications}>
        {children}
      </ToastProvider>
    </TooltipProvider>
  );
}
