"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { overlayItem, overlayList, overlayPanel } from "./overlay-styles";

export type SelectOption = { value: string; label: string };

/** Radix Select forbids an empty item value; "" (= "all" / "none") travels under this stand-in. */
const EMPTY = "__empty__";
const enc = (v: string) => (v === "" ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? "" : v);

/**
 * Drop-down choice in the app's own look (user request 2026-11-21: the browser's native option list did not match
 * the design). Same panel, items and check mark as the toolbar menus (`overlay-styles.ts`). Works inside a plain
 * form: a hidden input named `name` carries the value, so GET filter forms and server actions read it as before.
 * Controlled (`value` + `onValueChange`) or not (`defaultValue`).
 */
export function SelectMenu({
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  id,
  ariaLabel,
  ariaDescribedBy,
  invalid,
  className,
  testId,
}: {
  name?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
  className?: string;
  testId?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  return (
    <>
      <Select.Root
        value={enc(current)}
        onValueChange={(v) => {
          const next = dec(v);
          if (value === undefined) setInner(next);
          onValueChange?.(next);
        }}
        disabled={disabled}
      >
        <Select.Trigger
          id={id}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          className={cn(
            "group inline-flex h-10 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-bronze-600 bg-ink-900 px-3.5 text-left text-sm text-ivory-100 outline-hidden",
            "focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-500/25 data-[state=open]:border-gold-500 data-[state=open]:ring-2 data-[state=open]:ring-gold-500/25",
            "aria-[invalid=true]:border-cinnabar-500 disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          data-testid={testId}
          data-value={current}
        >
          <span className="truncate">
            <Select.Value />
          </span>
          <Select.Icon asChild>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-ivory-500 transition-transform group-data-[state=open]:rotate-180"
            />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              overlayPanel,
              "max-h-[min(20rem,var(--radix-select-content-available-height))] w-(--radix-select-trigger-width) min-w-44 overflow-hidden",
            )}
          >
            <Select.Viewport className={overlayList}>
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={enc(o.value)}
                  className={cn(overlayItem, "data-[state=checked]:font-medium data-[state=checked]:text-gold-300")}
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Check aria-hidden="true" className="size-4 text-gold-400" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {name && <input type="hidden" name={name} value={current} />}
    </>
  );
}
