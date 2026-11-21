"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./init-scripts";

/**
 * Dark / light switch in the top bar, left of the language button (user request 2026-11-14). State =
 * data-theme="light" on <html>; globals.css redefines the colour tokens for it, so components keep the
 * same classes. Remembered per browser (default dark; applied before paint by init-scripts.ts). Dark: shows a sun (go light); light: shows a moon (go dark).
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const isLight = () => document.documentElement.dataset.theme === "light";

export function ThemeToggle({ labels }: { labels: { toLight: string; toDark: string } }) {
  // The server renders the default (dark); the inline script may already have switched <html> to light.
  const light = useSyncExternalStore(subscribe, isLight, () => false);

  const toggle = () => {
    const next = !light;
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "light" : "dark");
    } catch {
      // Storage unavailable (private mode): the choice simply is not remembered.
    }
  };

  const label = light ? labels.toDark : labels.toLight;
  const Icon = light ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
