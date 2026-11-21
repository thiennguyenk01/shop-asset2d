"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Popover, Slider } from "radix-ui";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { filterTrigger, overlayPanel } from "@/components/ui/overlay-styles";
import { useRouter } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { PRICE_STEP, shopQuery, type ShopParams } from "@backend/lib/catalog/shop-params";
import { cn } from "@/lib/cn";
import { formatVnd, INTL_TAG } from "@backend/lib/format";

type Draft = { min: number | null; max: number | null };

/**
 * Toolbar price filter (evondevKit overlay.md "Popover lọc" + components/range-slider.md): a filter button
 * that opens a small form — two-thumb slider (0 → sliderMax; right thumb at the end = no upper bound,
 * labelled "…+"), "From" / "To" inputs, footer with a text "Clear" link and an "Apply" button.
 * Changes only edit a draft; Apply writes ?min=&max= and returns to page 1. Esc / click outside drops the draft.
 */
export function PriceFilter({ params, sliderMax }: { params: ShopParams; sliderMax: number }) {
  const t = useTranslations("shop.priceFilter");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const current: Draft = { min: params.min ?? null, max: params.max ?? null };
  const [draft, setDraft] = useState<Draft>(current);

  const vnd = (n: number) => formatVnd(n, locale);
  const active = current.min !== null || current.max !== null;
  const summary =
    current.min !== null && current.max !== null
      ? t("range", { min: vnd(current.min), max: vnd(current.max) })
      : current.min !== null
        ? t("from", { min: vnd(current.min) })
        : current.max !== null
          ? t("upTo", { max: vnd(current.max) })
          : t("button");

  const sliderValue = [Math.min(draft.min ?? 0, sliderMax), Math.min(draft.max ?? sliderMax, sliderMax)];
  const next: Draft = draft.min !== null && draft.max !== null && draft.min > draft.max ? { min: draft.max, max: draft.min } : draft;
  const changed = next.min !== current.min || next.max !== current.max;
  const empty = !active && draft.min === null && draft.max === null;

  const navigate = (d: Draft) => {
    setOpen(false);
    startTransition(() =>
      router.push({ pathname: "/shop", query: shopQuery(params, { min: d.min ?? undefined, max: d.max ?? undefined }) }),
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(current);
        setOpen(o);
      }}
    >
      <Popover.Trigger data-testid="price-filter-trigger" disabled={isPending} className={cn(filterTrigger, "group max-w-64")}>
        <span className={cn("truncate leading-normal", active && "text-gold-300")}>{summary}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ivory-500 transition-transform group-data-[state=open]:rotate-180" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={t("title")}
          data-testid="price-filter"
          className={cn(overlayPanel, "w-96 max-w-[calc(100vw-2rem)]")}
        >
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm font-medium text-ivory-100">{t("title")}</p>
            <div>
              <Slider.Root
                min={0}
                max={sliderMax}
                step={PRICE_STEP}
                value={sliderValue}
                minStepsBetweenThumbs={0}
                onValueChange={([lo, hi]) => setDraft({ min: lo > 0 ? lo : null, max: hi >= sliderMax ? null : hi })}
                className="relative flex h-11 touch-none items-center select-none"
              >
                <Slider.Track className="relative h-1.5 grow rounded-full bg-ivory-100/10">
                  <Slider.Range className="absolute h-full rounded-full bg-gold-400" />
                </Slider.Track>
                {[t("min"), t("max")].map((label) => (
                  <Slider.Thumb
                    key={label}
                    aria-label={label}
                    // Negative inset on purpose: keeps the 20px thumb while giving a 44×44 hit area (range-slider.md).
                    className="relative block size-5 cursor-grab rounded-full border-2 border-gold-400 bg-ink-950 before:absolute before:-inset-3.5 before:content-[''] active:cursor-grabbing"
                  />
                ))}
              </Slider.Root>
              <div className="flex justify-between text-xs text-ivory-500 tabular-nums">
                <span>{vnd(0)}</span>
                <span>{t("orMore", { price: vnd(sliderMax) })}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PriceInput label={t("min")} value={draft.min} locale={locale} onCommit={(min) => setDraft((d) => ({ ...d, min }))} />
              <PriceInput label={t("max")} value={draft.max} locale={locale} onCommit={(max) => setDraft((d) => ({ ...d, max }))} />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-bronze-700 px-4 py-3">
            <button
              type="button"
              disabled={empty}
              onClick={() => (active ? navigate({ min: null, max: null }) : setDraft({ min: null, max: null }))}
              className="cursor-pointer text-sm text-ivory-500 underline-offset-4 hover:text-ivory-100 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
            >
              {t("clear")}
            </button>
            <Button size="sm" disabled={!changed} onClick={() => navigate(next)}>
              {t("apply")}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Number box: the label sits above; typed digits apply on blur / Enter, not per keystroke (range-slider.md). */
function PriceInput({ label, value, locale, onCommit }: { label: string; value: number | null; locale: Locale; onCommit: (v: number | null) => void }) {
  const id = useId();
  const format = (n: number | null) => (n === null ? "" : new Intl.NumberFormat(INTL_TAG[locale]).format(n));
  const [text, setText] = useState(format(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Slider moved: show the new value (adjust-state-while-rendering, no effect needed).
    setLastValue(value);
    setText(format(value));
  }
  const commit = () => {
    const digits = text.replace(/\D/g, "").slice(0, 10);
    const n = digits ? Number(digits) : 0;
    const v = n > 0 ? n : null;
    setText(format(v));
    onCommit(v);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ivory-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="h-11 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-8 pl-3 text-base text-ivory-100 tabular-nums outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25 md:h-10 md:text-sm"
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ivory-500">
          ₫
        </span>
      </div>
    </div>
  );
}
