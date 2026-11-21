"use client";

import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";
import { overlayItem, overlayList, overlayPanel, filterTrigger } from "@/components/ui/overlay-styles";
import { Link } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";

export type FilterOption = { key: string; label: string; query: Record<string, string>; selected: boolean; count?: number };

/**
 * Toolbar filter / sort button (evondevKit entity-grid "Thanh công cụ", choice-controls "Select",
 * overlay "Dropdown"). Looks like an input, no hover; shows the chosen value; opens a menu of links, so
 * every filter state is still a shareable URL (works without JavaScript inside the menu).
 * `label` is the dimension ("Thể loại"); `value` the chosen option, or undefined when nothing is chosen.
 *
 * Touch: Radix opens a dropdown as soon as the finger lands (pointerdown), so swiping the toolbar sideways opened
 * a menu (user report 2026-11-21). For touch and pen the menu opens on the tap instead (click — the browser sends
 * none when the finger scrolled); mouse and keyboard keep Radix behaviour.
 */
export function FilterMenu({
  label,
  value,
  options,
  testId,
}: {
  label: string;
  value?: string;
  options: FilterOption[];
  testId?: string;
}) {
  const active = value !== undefined;
  const [open, setOpen] = useState(false);
  const pointer = useRef<string | null>(null);
  // Whether the menu was open when the finger landed: Radix already closes it on that press (outside the menu).
  const openAtPress = useRef(false);
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        data-testid={testId}
        className={cn(filterTrigger, "group max-w-60")}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
          openAtPress.current = open;
          if (e.pointerType !== "mouse") e.preventDefault(); // skip Radix open-on-press: wait for the tap
        }}
        onClick={(e) => {
          if (e.detail > 0 && pointer.current !== null && pointer.current !== "mouse") setOpen(!openAtPress.current);
          pointer.current = null;
        }}
      >
        <span className={cn("truncate leading-normal", active && "text-gold-300")} title={active ? `${label}: ${value}` : label}>
          {active ? value : label}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ivory-500 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={label}
          className={cn(overlayPanel, overlayList, "max-h-83 w-72 min-w-(--radix-dropdown-menu-trigger-width) overflow-y-auto")}
        >
          {options.map((o) => (
            <DropdownMenu.Item key={o.key} asChild>
              <Link
                href={{ pathname: "/shop", query: o.query }}
                aria-current={o.selected ? "true" : undefined}
                className={cn(overlayItem, o.selected && "font-medium")}
              >
                <span className="flex-1 text-pretty">{o.label}</span>
                {o.count !== undefined && <span className="text-xs text-ivory-500 tabular-nums">{o.count}</span>}
                <Check aria-hidden="true" className={cn("size-4 shrink-0 text-gold-400", !o.selected && "invisible")} />
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
