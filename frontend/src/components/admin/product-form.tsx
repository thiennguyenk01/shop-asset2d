"use client";

import { CircleDot, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { AdminLocale } from "@backend/lib/admin/product-rules";
import { RESOLUTION_GROUPS, SOFTWARE_GROUPS, splitResolution, type SpecGroup } from "@backend/lib/admin/spec-options";
import type { AdminFormState } from "@backend/modules/product/admin-actions";
import { CheckboxField, CheckboxGroup, SpecPicker, TextArea, TextField } from "./fields";
import { LocaleTabs } from "./locale-tabs";
import { PackCard, usePackTab } from "./pack-editor";
import type { PackTab } from "./pack-tabs";

export type ProductFormValues = {
  slug: string;
  type: "FREE" | "PREMIUM";
  priceVnd: number;
  compareAtPriceVnd: number | null;
  isFeatured: boolean;
  resolution: string;
  compatibleSoftware: string[];
  genreIds: string[];
  artStyleIds: string[];
  translations: Record<
    AdminLocale,
    { title: string; shortDescription: string; description: string; contentsList: string[] }
  >;
};

type Action = (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
const INITIAL: AdminFormState = { status: "idle" };
/** Fields of the Info tab; every other field (vi.title, en.description…) is on the Content tab. */
const INFO_FIELDS = new Set(["slug", "type", "priceVnd", "compareAtPriceVnd", "resolution", "compatibleSoftware", "genreIds", "artStyleIds"]);

/**
 * The pack's own data (GĐ5.2; tabs since 2026-11-21): one form shown on two tabs of the pack editor — Info (type,
 * link, price, genres, styles, specs) and Content (texts in VI / EN / ZH) — saved together by the sticky bar.
 * After a failed save the submitted values come back from the action (React resets uncontrolled inputs) and the
 * editor opens the tab holding the first error.
 */
export function ProductForm({
  action,
  initial,
  genres,
  styles,
  locked,
}: {
  action: Action;
  initial: ProductFormValues;
  genres: { id: string; name: string }[];
  styles: { id: string; name: string }[];
  locked: boolean;
}) {
  const t = useTranslations("adminProducts");
  const { toast } = useToast();
  const { tab, setTab, barSlot, noteSlot } = usePackTab();
  const formId = useId();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [type, setType] = useState(initial.type);
  const [dirty, setDirty] = useState(false);
  // "Discard" remounts the fields with the saved values (and forgets values echoed back by a failed save).
  const [round, setRound] = useState(0);
  const [discardedAt, setDiscardedAt] = useState<AdminFormState | null>(null);
  const shown = useRef<number | undefined>(undefined);
  const jumped = useRef<AdminFormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: t("saved") });
    }
  }, [state, t, toast]);

  // Adjust during render (not in an effect): a successful save means nothing is left unsaved.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.status === "success") setDirty(false);
    const echoed = state.status === "error" ? state.values?.type : undefined;
    if (echoed === "FREE" || echoed === "PREMIUM") setType(echoed);
  }

  // An error in the tab not shown: open that tab once.
  useEffect(() => {
    if (state.status !== "error" || !state.fields || jumped.current === state) return;
    jumped.current = state;
    const first = Object.keys(state.fields)[0];
    if (!first) return;
    const target: PackTab = INFO_FIELDS.has(first) ? "info" : "content";
    if (target !== tab) setTab(target);
  }, [state, tab, setTab]);

  // After an error, show what was typed; otherwise the saved values.
  const v = state.status === "error" && discardedAt !== state ? state.values : undefined;
  const val = (name: string, fallback: string) => (v && typeof v[name] === "string" ? (v[name] as string) : fallback);
  const list = (name: string, fallback: string[]) => (v ? ((v[name] as string[] | undefined) ?? []) : fallback);
  const err = (name: string) => state.fields?.[name] && t(`errors.${state.fields[name]}` as "errors.generic");
  const tr = initial.translations;
  const specGroups = (groups: readonly SpecGroup[]) =>
    groups.map((g) => ({ ...g, label: t(`specGroups.${g.id}` as "specGroups.extra") }));
  const shownType = type;

  const discard = () => {
    setDiscardedAt(state);
    setType(initial.type);
    setDirty(false);
    setRound((r) => r + 1);
  };

  return (
    <form
      id={formId}
      action={formAction}
      noValidate
      onChange={() => setDirty(true)}
      className="flex flex-col gap-4"
      data-testid="product-form"
    >
      {state.error && <FormError message={t(`errors.${state.error}` as "errors.generic")} />}

      <div key={round} className="contents">
        <div hidden={tab !== "info"}>
          <PackCard testId="pack-info">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset className="flex min-w-0 flex-col">
                <legend className="mb-1.5 text-sm font-medium text-ivory-100">{t("typeLabel")}</legend>
                <div className="flex gap-1 rounded-xl bg-ink-950/60 p-1">
                  {(["PREMIUM", "FREE"] as const).map((k) => (
                    <label
                      key={k}
                      className={cn(
                        "inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[0.625rem] text-sm text-ivory-300 transition-colors has-checked:bg-ink-800 has-checked:font-semibold has-checked:text-ivory-100 has-checked:shadow-[inset_0_-2px_0_var(--color-gold-500)] has-focus-visible:ring-2 has-focus-visible:ring-gold-500/40",
                        locked && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <input
                        type="radio"
                        name={locked ? undefined : "type"}
                        value={k}
                        checked={shownType === k}
                        disabled={locked}
                        onChange={() => setType(k)}
                        className="sr-only"
                        data-testid={`type-${k}`}
                      />
                      {t(`type.${k}`)}
                    </label>
                  ))}
                </div>
                {locked && <input type="hidden" name="type" value={initial.type} />}
                {!locked && <p className="mt-1.5 text-xs text-pretty text-ivory-500">{t("typeHint")}</p>}
              </fieldset>
              <TextField
                label={t("slug")}
                name="slug"
                defaultValue={val("slug", initial.slug)}
                readOnly={locked}
                hint={locked ? t("lockedHint") : t("slugHint")}
                error={err("slug")}
                autoComplete="off"
                spellCheck={false}
              />
              <TextField
                label={t("price")}
                name="priceVnd"
                inputMode="numeric"
                defaultValue={val("priceVnd", shownType === "FREE" ? "0" : initial.priceVnd ? String(initial.priceVnd) : "")}
                readOnly={shownType === "FREE"}
                placeholder={shownType === "FREE" ? undefined : "150.000"}
                hint={t("priceHint")}
                error={err("priceVnd")}
                key={`price-${shownType}`}
              />
              <TextField
                label={t("compareAt")}
                name="compareAtPriceVnd"
                inputMode="numeric"
                defaultValue={val("compareAtPriceVnd", initial.compareAtPriceVnd ? String(initial.compareAtPriceVnd) : "")}
                disabled={shownType === "FREE"}
                hint={t("compareAtHint")}
                error={err("compareAtPriceVnd")}
              />
            </div>
            <CheckboxField
              label={t("isFeatured")}
              name="isFeatured"
              defaultChecked={v ? v.isFeatured === "on" : initial.isFeatured}
            />
            <CheckboxGroup legend={t("genres")} name="genreIds" options={genres} selected={list("genreIds", initial.genreIds)} />
            <CheckboxGroup legend={t("styles")} name="artStyleIds" options={styles} selected={list("artStyleIds", initial.artStyleIds)} />
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-ivory-100">{t("specsTitle")}</legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SpecPicker
                  legend={t("resolution")}
                  name="resolution"
                  groups={specGroups(RESOLUTION_GROUPS)}
                  selected={list("resolution", splitResolution(initial.resolution))}
                  labels={{ edit: t("specEdit"), pick: t("specPick"), done: t("specDone"), none: t("specNone"), extra: t("specGroups.extra"), hint: t("specHint") }}
                  shownChips={4}
                  error={err("resolution")}
                  testId="spec-resolution"
                />
                <SpecPicker
                  legend={t("software")}
                  name="compatibleSoftware"
                  groups={specGroups(SOFTWARE_GROUPS)}
                  selected={list("compatibleSoftware", initial.compatibleSoftware)}
                  labels={{ edit: t("specEdit"), pick: t("specPick"), done: t("specDone"), none: t("specNone"), extra: t("specGroups.extra"), hint: t("specHint") }}
                  shownChips={6}
                  error={err("compatibleSoftware")}
                  testId="spec-software"
                />
              </div>
              <p className="text-xs text-pretty text-ivory-500">{t("specsNote")}</p>
            </fieldset>
          </PackCard>
        </div>

        <div hidden={tab !== "content"}>
          <PackCard testId="pack-content">
            <LocaleTabs
              idPrefix="pack"
              errorIn={(l) => Object.keys(state.fields ?? {}).some((k) => k.startsWith(`${l}.`))}
              missing={(l) => !tr[l].title}
              panel={(l) => (
                <>
                  <TextField label={t("title")} name={`${l}.title`} defaultValue={val(`${l}.title`, tr[l].title)} error={err(`${l}.title`)} lang={l} />
                  <TextArea
                    label={t("shortDescription")}
                    name={`${l}.shortDescription`}
                    defaultValue={val(`${l}.shortDescription`, tr[l].shortDescription)}
                    error={err(`${l}.shortDescription`)}
                    rows={2}
                    lang={l}
                  />
                  <TextArea
                    label={t("description")}
                    name={`${l}.description`}
                    defaultValue={val(`${l}.description`, tr[l].description)}
                    error={err(`${l}.description`)}
                    rows={5}
                    lang={l}
                  />
                  <TextArea
                    label={t("contentsList")}
                    name={`${l}.contentsList`}
                    defaultValue={val(`${l}.contentsList`, tr[l].contentsList.join("\n"))}
                    hint={t("linesHint")}
                    error={err(`${l}.contentsList`)}
                    rows={4}
                    lang={l}
                  />
                </>
              )}
            />
            <p className="text-xs text-pretty text-ivory-500">{t("contentIntro")}</p>
          </PackCard>
        </div>
      </div>

      {/* Save sits under the "ready to sell" list, left of Delete (user request 2026-11-21); it is outside this
          form in the DOM, hence `form={formId}`. Above it, while something is unsaved: the note and Discard. */}
      {noteSlot &&
        dirty &&
        createPortal(
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gold-300" data-testid="product-dirty">
            <CircleDot aria-hidden="true" className="size-3.5" />
            {t("unsaved")}
            <button
              type="button"
              onClick={discard}
              disabled={pending}
              className="cursor-pointer text-ivory-300 underline underline-offset-2 hover:text-ivory-100 disabled:cursor-not-allowed"
            >
              {t("discard")}
            </button>
          </p>,
          noteSlot,
        )}
      {barSlot &&
        createPortal(
          <Button type="submit" form={formId} size="sm" disabled={pending} aria-busy={pending || undefined} data-testid="product-save">
            <Save aria-hidden="true" className="size-4" />
            {pending ? t("saving") : t("save")}
          </Button>,
          barSlot,
        )}
    </form>
  );
}
