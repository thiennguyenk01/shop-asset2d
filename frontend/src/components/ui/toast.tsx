"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Toast } from "radix-ui";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Toast notifications (Radix Toast — announced to screen readers).
 * Usage in a client component:
 *   const { toast } = useToast();
 *   toast({ variant: "success", title: t("cart.added") });
 * Titles/descriptions must come from translations.
 */
type ToastVariant = "success" | "error" | "info";
type ToastInput = { title: string; description?: string; variant?: ToastVariant };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(null);

const tone: Record<ToastVariant, { box: string; icon: ReactNode }> = {
  success: { box: "border-jade-500/60", icon: <CheckCircle2 className="size-5 text-jade-400" aria-hidden="true" /> },
  error: { box: "border-cinnabar-500/70", icon: <AlertTriangle className="size-5 text-cinnabar-500" aria-hidden="true" /> },
  info: { box: "border-gold-500/50", icon: <Info className="size-5 text-gold-400" aria-hidden="true" /> },
};

let nextId = 1;

export function ToastProvider({ children, closeLabel, regionLabel }: { children: ReactNode; closeLabel: string; regionLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: ToastInput) => setItems((prev) => [...prev, { ...t, id: nextId++ }]), []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext value={value}>
      <Toast.Provider swipeDirection="right" duration={5000} label={regionLabel}>
        {children}
        {items.map((item) => {
          const v = tone[item.variant ?? "info"];
          return (
            <Toast.Root
              key={item.id}
              type={item.variant === "error" ? "foreground" : "background"}
              onOpenChange={(open) => !open && setItems((prev) => prev.filter((p) => p.id !== item.id))}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-ink-850 p-4 shadow-panel",
                "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:translate-x-full",
                v.box,
              )}
              data-testid="toast"
            >
              {v.icon}
              <div className="flex flex-1 flex-col gap-0.5">
                <Toast.Title className="text-sm font-semibold text-ivory-100">{item.title}</Toast.Title>
                {item.description && <Toast.Description className="text-sm text-ivory-300">{item.description}</Toast.Description>}
              </div>
              <Toast.Close aria-label={closeLabel} className="text-ivory-500 hover:text-ivory-100">
                <X className="size-4" aria-hidden="true" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
        {/* Toasts stay above the mobile tab bar (--tabbar-h) and any extra bottom bar (--bottom-bar-height, e.g. the pack section nav), and above the floating contact chat button (+4.5rem). */}
        <Toast.Viewport className="fixed right-0 bottom-[calc(var(--tabbar-h,0px)+var(--bottom-bar-height,0px)+4.5rem)] z-60 m-0 flex w-full max-w-sm list-none flex-col gap-2 p-4 outline-none" />
      </Toast.Provider>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
