"use client";

import { ChevronRight, CircleAlert, CircleCheck, CircleDashed, FileStack, Images, Info, Languages, Layers, Settings2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PACK_TABS, type CheckItem, type CheckState, type PackTab } from "./pack-tabs";

/**
 * Pack editor (user request 2026-11-21, wireframe A "Thẻ tab + khung Sẵn sàng đăng bán"): five tabs, one visible
 * at a time so the page stays one screen long; the "ready to sell" panel says what is missing and jumps to it.
 * Every panel stays mounted (hidden, not removed): typed text in Info / Content and uploads in progress survive a
 * tab switch. The open tab is kept in the URL (`?tab=`) so a reload or a shared link opens the same tab.
 */

const ICONS: Record<PackTab, typeof Info> = { info: Settings2, content: Languages, media: Images, sections: Layers, versions: FileStack };

type Slot = HTMLElement | null;
const TabContext = createContext<{
  tab: PackTab;
  setTab: (t: PackTab) => void;
  barSlot: Slot;
  setBarSlot: (el: Slot) => void;
  noteSlot: Slot;
  setNoteSlot: (el: Slot) => void;
}>({ tab: "info", setTab: () => {}, barSlot: null, setBarSlot: () => {}, noteSlot: null, setNoteSlot: () => {} });
export const usePackTab = () => useContext(TabContext);

export function PackEditor({
  initialTab,
  tabs,
  children,
  aside,
  label,
}: {
  initialTab: PackTab;
  /** One entry per tab: its name, an optional count, and the state of its checklist line. */
  tabs: Record<PackTab, { label: string; count?: string | number; state?: CheckState }>;
  children: ReactNode;
  aside: ReactNode;
  label: string;
}) {
  // Where the pack form shows its Save button and "unsaved" note: under the checklist, left of Delete.
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const [noteSlot, setNoteSlot] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useUrlTab<PackTab>(initialTab);

  return (
    <TabContext.Provider value={{ tab, setTab, barSlot, setBarSlot, noteSlot, setNoteSlot }}>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <EditorTabBar
            idPrefix="pack"
            label={label}
            value={tab}
            onSelect={setTab}
            items={PACK_TABS.map((id) => ({ id, Icon: ICONS[id], ...tabs[id] }))}
          />
          {children}
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">{aside}</div>
      </div>
    </TabContext.Provider>
  );
}

/**
 * The tab row of an Admin editor (pack, section): underline on the open tab, an optional count and a red / gold
 * dot for "missing" / "check". Ids: `{idPrefix}-tab-{id}` (also the test id), panels `{idPrefix}-panel-{id}`.
 */
export function EditorTabBar<T extends string>({
  idPrefix,
  label,
  items,
  value,
  onSelect,
}: {
  idPrefix: string;
  label: string;
  items: { id: T; label: string; Icon: typeof Info; count?: string | number; state?: CheckState }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-bronze-700 px-4 sm:mx-0 sm:px-0"
      data-testid={`${idPrefix}-tabs`}
    >
      {items.map(({ id, label: name, Icon, count, state }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${id}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${id}`}
            onClick={() => onSelect(id)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-3.5 text-sm whitespace-nowrap transition-colors",
              on
                ? "bg-ink-850 font-semibold text-ivory-100 shadow-[inset_0_-2px_0_var(--color-gold-500)]"
                : "text-ivory-300 hover:bg-ivory-100/5 hover:text-ivory-100",
            )}
            data-testid={`${idPrefix}-tab-${id}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {name}
            {count !== undefined && count !== 0 && (
              <span className="rounded-full bg-ink-800 px-1.5 text-xs text-ivory-500 tabular-nums">{count}</span>
            )}
            {state === "miss" && <span aria-hidden="true" className="size-1.5 rounded-full bg-cinnabar-500" />}
            {state === "warn" && <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-400" />}
          </button>
        );
      })}
    </div>
  );
}

/** Keeps an editor's open tab in the URL (`?tab=`) so a reload or a shared link opens the same tab. */
export function useUrlTab<T extends string>(initial: T): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(initial);
  const setTab = useCallback((t: T) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }, []);
  return [tab, setTab];
}

/** One tab's panel; `tabs` lists the tabs it belongs to (Info and Content share the pack form). */
export function PackPanel({ tabs, children, className }: { tabs: PackTab[]; children: ReactNode; className?: string }) {
  const { tab } = usePackTab();
  return (
    <div
      role="tabpanel"
      id={`pack-panel-${tabs[0]}`}
      aria-labelledby={`pack-tab-${tab}`}
      hidden={!tabs.includes(tab)}
      className={className}
    >
      {children}
    </div>
  );
}

/** A card around a tab's content (same frame as `FormCard`). */
export function PackCard({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-4 sm:p-5" data-testid={testId}>
      {children}
    </section>
  );
}

/** "Ready to sell" (or "Needed to sell" for a draft): each line opens its tab. */
export function PackChecklist({
  title,
  items,
  actions,
  footer,
}: {
  title: string;
  items: CheckItem[];
  /** Right of the row under the list (Delete); the pack form puts "Save" in front of it (2026-11-21). */
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const { setTab, setBarSlot, setNoteSlot } = usePackTab();
  const done = items.filter((i) => i.state !== "miss").length;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-4" data-testid="pack-checklist">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold text-ivory-100">{title}</h2>
        <span className="text-xs text-ivory-500 tabular-nums">
          {done}/{items.length}
        </span>
      </header>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i.key}>
            <button
              type="button"
              onClick={() => {
                setTab(i.tab);
                document.getElementById(`pack-tab-${i.tab}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-pretty text-ivory-100 transition-colors hover:bg-ivory-100/5"
              data-testid="pack-check"
              data-state={i.state}
              data-key={i.key}
            >
              {i.state === "ok" ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-jade-400" />
              ) : i.state === "warn" ? (
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold-400" />
              ) : (
                <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cinnabar-500" />
              )}
              <span className={cn("flex-1", i.state === "miss" && "text-ivory-300")}>{i.text}</span>
              <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ivory-500" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-bronze-700 pt-3">
        {/* "Unsaved changes · Discard" (from the pack form), then the row: Save (from the form) · Delete. */}
        <div ref={setNoteSlot} className="contents" />
        <div className="flex flex-wrap items-center gap-2" data-testid="product-savebar">
          <div ref={setBarSlot} className="contents" />
          {actions}
        </div>
        {footer}
      </div>
    </section>
  );
}

/** Jump to a tab from anywhere inside the editor (e.g. the pack form after an error in the other tab). */
export function useJumpToTab(target: PackTab | null) {
  const { setTab } = usePackTab();
  useEffect(() => {
    if (target) setTab(target);
  }, [target, setTab]);
}
