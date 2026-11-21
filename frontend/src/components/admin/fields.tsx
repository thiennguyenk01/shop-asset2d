"use client";

import { Check, Pencil, Plus } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { cn } from "@/lib/cn";
import { extraValues } from "@backend/lib/admin/spec-options";

/**
 * Admin form fields — same look as the account forms (components/account/auth-forms.tsx): label above,
 * control, then hint or error (error replaces the hint; both announced via aria-describedby).
 */
const control =
  "w-full rounded-xl border border-bronze-600 bg-ink-900 px-3.5 text-base text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25 aria-[invalid=true]:border-cinnabar-500 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

type Common = { label: string; name: string; hint?: string; error?: string | false };

function Shell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | false;
  children: ReactNode;
}) {
  const noteId = `${id}-note`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ivory-100">
        {label}
      </label>
      {children}
      {error ? (
        <p id={noteId} className="text-xs text-cinnabar-500 light:text-cinnabar-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="text-xs text-pretty text-ivory-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const described = (id: string, hint?: string, error?: string | false) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error || hint ? `${id}-note` : undefined,
});

export function TextField({ label, name, hint, error, className, ...props }: Common & ComponentProps<"input">) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        className={cn(control, "h-11", className)}
        {...described(id, hint, error)}
        {...props}
      />
    </Shell>
  );
}

export function TextArea({ label, name, hint, error, className, ...props }: Common & ComponentProps<"textarea">) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)}
        {...described(id, hint, error)}
        {...props}
      />
    </Shell>
  );
}

/** A labelled drop-down (`SelectMenu`, the app's own list instead of the browser's). */
export function SelectField({
  label,
  name,
  hint,
  error,
  className,
  testId,
  ...props
}: Common &
  Pick<ComponentProps<typeof SelectMenu>, "options" | "value" | "defaultValue" | "onValueChange" | "disabled"> & {
    className?: string;
    testId?: string;
  }) {
  const id = useId();
  const d = described(id, hint, error);
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <SelectMenu
        id={id}
        name={name}
        ariaDescribedBy={d["aria-describedby"]}
        invalid={d["aria-invalid"]}
        className={cn("h-11 w-full text-base sm:text-sm", className)}
        testId={testId}
        {...props}
      />
    </Shell>
  );
}

/** A group of checkboxes sharing one name (e.g. genreIds); `selected` = ids checked initially. */
export function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: { id: string; name: string }[];
  selected: string[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ivory-100">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-bronze-600 px-3 text-sm text-ivory-300 transition-colors has-checked:border-gold-500 has-checked:bg-gold-500/10 has-checked:text-gold-300 has-focus-visible:ring-2 has-focus-visible:ring-gold-500/40"
          >
            <input
              type="checkbox"
              name={name}
              value={o.id}
              defaultChecked={selected.includes(o.id)}
              className="sr-only"
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Ready-made spec choices (resolution, software, file formats: `@backend/lib/admin/spec-options`), folded into a
 * summary card (user request 2026-11-21: the open lists made the form far too long). The card shows what is
 * chosen; "Edit" opens the chip groups in place. Each ticked chip is one value of `name`; the chips stay in the
 * form while folded (hidden, still submitted). Saved values that no group offers come first, already ticked, so
 * a save keeps them.
 */
export function SpecPicker({
  legend,
  name,
  groups,
  selected,
  labels,
  shownChips,
  error,
  testId,
}: {
  legend: string;
  name: string;
  groups: { id: string; label: string; options: readonly string[] }[];
  selected: string[];
  labels: { edit: string; pick: string; done: string; none: string; extra: string; hint: string };
  /** How many chosen values the folded card shows before "+N". */
  shownChips: number;
  error?: string | false;
  testId?: string;
}) {
  const key = (v: string) => v.trim().toLowerCase();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(() => new Set(selected.map(key)));
  const extras = extraValues(groups, selected);
  const all = [...(extras.length > 0 ? [{ id: "extra", label: labels.extra, options: extras }] : []), ...groups];
  const values = all.flatMap((g) => g.options).filter((o) => chosen.has(key(o)));
  const panelId = useId();
  const toggle = (o: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(key(o))) next.delete(key(o));
      else next.add(key(o));
      return next;
    });

  return (
    <fieldset
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-ink-950/40 p-3.5",
        error ? "border-cinnabar-500" : "border-bronze-700",
        open && "md:col-span-2",
      )}
      aria-labelledby={`${panelId}-label`}
      data-testid={testId}
      data-open={open}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={`${panelId}-label`} className="text-sm font-medium text-ivory-100">
          {legend}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-xs"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {open ? <Check aria-hidden="true" /> : values.length > 0 ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {open ? labels.done : values.length > 0 ? labels.edit : labels.pick}
        </Button>
      </div>
      {!open &&
        (values.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid={testId ? `${testId}-summary` : undefined}>
            {values.slice(0, shownChips).map((v) => (
              <span key={v} className={cn(CHIP, "h-7 border-gold-500 bg-gold-500/10 px-2.5 text-xs text-gold-300")}>
                {v}
              </span>
            ))}
            {values.length > shownChips && (
              <span className={cn(CHIP, "h-7 px-2.5 text-xs tabular-nums")}>+{values.length - shownChips}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-ivory-500">{labels.none}</p>
        ))}
      {error && <p className="text-xs text-cinnabar-500 light:text-cinnabar-600">{error}</p>}
      <div id={panelId} hidden={!open} className="flex flex-col gap-3 pt-1">
        <p className="text-xs text-pretty text-ivory-500">{labels.hint}</p>
        {all.map((g) => (
          <div key={g.id} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-ivory-500 uppercase">{g.label}</span>
            <div className="flex flex-wrap gap-2">
              {g.options.map((o) => (
                <label key={o} className={cn(CHIP, "cursor-pointer has-checked:border-gold-500 has-checked:bg-gold-500/10 has-checked:text-gold-300 has-focus-visible:ring-2 has-focus-visible:ring-gold-500/40")}>
                  <input type="checkbox" name={name} value={o} checked={chosen.has(key(o))} onChange={() => toggle(o)} className="sr-only" />
                  {o}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

const CHIP = "inline-flex h-9 items-center gap-2 rounded-full border border-bronze-600 px-3 text-sm whitespace-nowrap text-ivory-300 transition-colors";

export function CheckboxField({
  label,
  name,
  hint,
  defaultChecked,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-gold-500"
        aria-describedby={hint ? `${id}-note` : undefined}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ivory-100">
          {label}
        </label>
        {hint && (
          <p id={`${id}-note`} className="text-xs text-ivory-500">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Card with a heading for admin forms. */
export function FormCard({
  title,
  intro,
  children,
  aside,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-sans text-base font-semibold text-ivory-100">{title}</h2>
          {intro && <p className="text-xs text-pretty text-ivory-500">{intro}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
