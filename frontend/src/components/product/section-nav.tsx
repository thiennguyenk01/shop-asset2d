"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "./category-icon";

export type SectionNavItem = { id: string; label: string; icon: string };

/**
 * Bottom navigation of a pack's sections (Nhân vật, Bản đồ, Quái vật…).
 * Fixed to the bottom of the viewport (above the mobile tab bar; right of the desktop sidebar) so it follows the user while scrolling; scrolls
 * horizontally when there are many sections. The item of the section currently in view is
 * highlighted with a gold underline (scroll spy), and the bar keeps it visible.
 */
export function SectionNav({
  items,
  label,
  scrollLabels,
}: {
  items: SectionNavItem[];
  label: string;
  /** Arrow buttons for mouse users (responsive.md R10): the row has no visible scrollbar. */
  scrollLabels: { previous: string; next: string };
}) {
  const [edges, setEdges] = useState({ start: false, end: false });
  const [active, setActive] = useState(items[0]?.id);
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll spy: the active section is the last one whose top has passed 40% of the viewport.
  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let current = targets[0].id;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
        else break;
      }
      // At the very bottom the last sections can never reach the line — highlight the last one.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atEnd) current = targets[targets.length - 1].id;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  // Keep the active item visible inside the horizontal bar (scrolls the bar only, never the page).
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!list || !el) return;
    const left = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
    list.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  // Which ends still hide items (drives the arrow buttons).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () =>
      setEdges({ start: list.scrollLeft > 4, end: list.scrollLeft + list.clientWidth < list.scrollWidth - 4 });
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const page = (dir: -1 | 1) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({ left: dir * list.clientWidth * 0.8, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  // Lift toasts above the bar while it is mounted.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--bottom-bar-height", `${nav.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-bar-height");
    };
  }, []);

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav
      ref={navRef}
      aria-label={label}
      data-testid="section-nav"
      className="fixed inset-x-0 bottom-(--tabbar-h) z-40 border-t border-gold-500/30 bg-ink-950/95 shadow-[0_-8px_24px_rgb(0_0_0/0.45)] backdrop-blur transition-[left] duration-200 ease-out motion-reduce:transition-none lg:left-64 lg:pb-[env(safe-area-inset-bottom)] lg:sidebar-collapsed:left-16"
    >
      <div className="relative mx-auto max-w-7xl">
        <ul
          ref={listRef}
          className="scrollbar-none flex snap-x scroll-px-2 overflow-x-auto px-2 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] sm:scroll-px-4 sm:px-4"
        >
          {items.map((item) => {
            const isActive = item.id === active;
            return (
              <li key={item.id} className="shrink-0 snap-start">
                <a
                  href={`#${item.id}`}
                  data-section={item.id}
                  aria-current={isActive ? "location" : undefined}
                  onClick={(e) => go(e, item.id)}
                  className={cn(
                    "relative flex min-w-[4.75rem] flex-col items-center gap-1 px-2.5 pt-2.5 pb-3 text-xs leading-tight whitespace-nowrap transition-colors sm:min-w-[5.5rem]",
                    "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                    isActive
                      ? "text-gold-300 after:bg-gold-400"
                      : "text-ivory-500 after:bg-transparent hover:text-ivory-100",
                  )}
                >
                  <CategoryIcon name={item.icon} className="size-5" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
        {/* Mouse users: arrows at both ends while items are hidden that way (touch users swipe). */}
        {(["start", "end"] as const).map((edge) =>
          edges[edge] ? (
            <button
              key={edge}
              type="button"
              onClick={() => page(edge === "start" ? -1 : 1)}
              aria-label={edge === "start" ? scrollLabels.previous : scrollLabels.next}
              title={edge === "start" ? scrollLabels.previous : scrollLabels.next}
              className={cn(
                "absolute top-1/2 hidden size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-bronze-600 bg-ink-850 text-ivory-100 transition-colors hover:bg-ink-800 pointer-fine:grid",
                edge === "start" ? "left-1" : "right-1",
              )}
            >
              {edge === "start" ? (
                <ChevronLeft aria-hidden="true" className="size-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4" />
              )}
            </button>
          ) : null,
        )}
      </div>
    </nav>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
