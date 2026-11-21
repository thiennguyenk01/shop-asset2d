"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * Cart item count for the badges (top bar, sidebar, mobile tab bar). The server renders <CartCountSync>
 * inside a <Suspense> in the layout (it reads the session / cart cookie); the client components that show
 * the badge read this tiny store. Cart actions call refresh(), which re-renders the sync with the new count.
 */
let count = 0;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function CartCountSync({ count: next }: { count: number }) {
  useEffect(() => {
    if (count === next) return;
    count = next;
    listeners.forEach((fn) => fn());
  }, [next]);
  return null;
}

export function useCartCount() {
  return useSyncExternalStore(
    subscribe,
    () => count,
    () => 0,
  );
}

/** Small gold pill with the count; nothing when the cart is empty. `label` is read by screen readers. */
export function CartBadge({ className, label }: { className?: string; label: (n: number) => string }) {
  const n = useCartCount();
  if (n === 0) return null;
  return (
    <span
      data-testid="cart-count"
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 text-[11px] leading-none font-semibold text-soot tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">{label(n)}</span>
    </span>
  );
}
