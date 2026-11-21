"use client";

import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Show the button once the reader is about a screen and a half down. */
const SHOW_AFTER = 1.5;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const TAKE_OVER = ["wheel", "touchstart", "keydown"] as const;

/** Stops the glide in progress (if any). */
let stopGlide: (() => void) | null = null;

/** Eased scroll to the top; length follows the distance (300–900 ms). Reader input stops it. */
function glideToTop() {
  stopGlide?.();
  const start = window.scrollY;
  if (start <= 0) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, 0);
    return;
  }
  const duration = Math.min(900, Math.max(300, start / 3));
  const t0 = performance.now();
  let id = 0;
  const stop = () => {
    cancelAnimationFrame(id);
    for (const type of TAKE_OVER) window.removeEventListener(type, stop);
    if (stopGlide === stop) stopGlide = null;
  };
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, Math.round(start * (1 - easeInOutCubic(p))));
    if (p < 1) id = requestAnimationFrame(step);
    else stop();
  };
  for (const type of TAKE_OVER) window.addEventListener(type, stop, { passive: true });
  stopGlide = stop;
  id = requestAnimationFrame(step);
}

/**
 * "Back to top" (user request): a small round button stacked right above the floating chat button. It fades
 * and slides in after scrolling down, and glides back up with an eased animation whose length follows the
 * distance (300–900 ms). Any wheel / touch / key input during the glide hands control back to the reader.
 * With "reduce motion" it jumps instantly.
 */
export function BackToTop() {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setVisible(window.scrollY > window.innerHeight * SHOW_AFTER);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => () => stopGlide?.(), []);

  return (
    <button
      type="button"
      onClick={glideToTop}
      aria-label={t("backToTop")}
      title={t("backToTop")}
      // Hidden: out of the tab order and the accessibility tree, and not clickable.
      inert={!visible}
      aria-hidden={!visible || undefined}
      data-visible={visible}
      data-testid="back-to-top"
      className={cn(
        // Centred above the chat button (chat: right-4 size-12 / sm:right-6 sm:size-14, bottom offset +1rem).
        "fixed right-5 bottom-[calc(var(--tabbar-h,0px)+var(--bottom-bar-height,0px)+4.75rem)] z-50 grid size-10 cursor-pointer place-items-center rounded-full",
        "sm:right-[1.875rem] sm:bottom-[calc(var(--tabbar-h,0px)+var(--bottom-bar-height,0px)+5.25rem)] sm:size-11",
        "border border-gold-500/50 bg-ink-900/95 text-gold-300 shadow-panel backdrop-blur transition-[opacity,translate,background-color] duration-300 ease-out hover:bg-ink-800 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp aria-hidden="true" className="size-5" />
    </button>
  );
}
