"use client";

import { Images, Languages, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { FormError } from "@/components/account/auth-forms";
import { CategoryIcon } from "@/components/product/category-icon";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { overlayItem, overlayList, overlayPanel } from "@/components/ui/overlay-styles";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { AdminLocale } from "@backend/lib/admin/product-rules";
import { FILE_FORMAT_GROUPS, RESOLUTION_GROUPS, splitResolution, type SpecGroup } from "@backend/lib/admin/spec-options";
import { deleteSectionAction, type AdminFormState } from "@backend/modules/product/admin-actions";
import { SpecPicker, TextArea, TextField } from "./fields";
import { LocaleTabs } from "./locale-tabs";
import { EditorTabBar, PackCard, useUrlTab } from "./pack-editor";
import type { SectionTab } from "./pack-tabs";

type Action = (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
/** Fields of the section's Info tab; the rest (vi.summary…) are on the Content tab. */
const SECTION_INFO_FIELDS = new Set(["assetCount", "sortOrder", "resolution", "fileFormats"]);
const INITIAL: AdminFormState = { status: "idle" };

/**
 * "Add section" tile at the end of the sections grid (2026-11-21): opens the list of categories the pack does not
 * have yet; picking one creates the section and opens its page.
 */
export function AddSectionTile({
  action,
  categories,
  label,
}: {
  action: Action;
  categories: { id: string; name: string; iconKey: string | null }[];
  label: string;
}) {
  const t = useTranslations("adminProducts");
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [, startTransition] = useTransition();
  const shown = useRef<AdminFormState | null>(null);
  useEffect(() => {
    if (state.status === "error" && state.error && shown.current !== state) {
      shown.current = state;
      toast({ variant: "error", title: t(`errors.${state.error}` as "errors.generic") });
    }
  }, [state, t, toast]);
  if (categories.length === 0) {
    return (
      <p className="flex min-h-[72px] items-center justify-center rounded-xl border border-dashed border-bronze-700 px-4 text-center text-sm text-ivory-500">
        {t("allAdded")}
      </p>
    );
  }
  const add = (categoryId: string) => {
    const form = new FormData();
    form.set("categoryId", categoryId);
    startTransition(() => formAction(form));
  };
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex min-h-[72px] items-center justify-center gap-2 rounded-xl border border-dashed border-bronze-600 px-4 text-sm text-ivory-300 transition-colors hover:border-gold-500 hover:text-gold-300 focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:outline-none disabled:opacity-60 data-[state=open]:border-gold-500 data-[state=open]:text-gold-300"
          data-testid="add-section"
        >
          <Plus aria-hidden="true" className="size-4" />
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(overlayPanel, "max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto")}
          data-testid="add-section-menu"
        >
          <div className={overlayList}>
            {categories.map((c) => (
              <DropdownMenu.Item key={c.id} onSelect={() => add(c.id)} className={overlayItem}>
                <CategoryIcon name={c.iconKey ?? ""} className="size-4 shrink-0 text-gold-300" />
                <span className="min-w-0 flex-1">{c.name}</span>
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export type SectionFormValues = {
  assetCount: number;
  sortOrder: number;
  resolution: string;
  fileFormats: string[];
  translations: Record<AdminLocale, { summary: string; contentsList: string[] }>;
};

/** Edit one section: counts, formats and its text in VI / EN / ZH; delete with confirmation. */
export function SectionForm({
  action,
  initial,
  productId,
  sectionId,
  header,
  gallery,
  mediaCount,
  initialTab,
}: {
  action: Action;
  initial: SectionFormValues;
  productId: string;
  sectionId: string;
  /** Title + intro, shown left of Save · Delete. */
  header: ReactNode;
  /** The section's pictures (the "Pictures" tab). */
  gallery: ReactNode;
  mediaCount: number;
  initialTab: SectionTab;
}) {
  const t = useTranslations("adminProducts");
  const formId = useId();
  const [tab, setTab] = useUrlTab<SectionTab>(initialTab);
  const jumped = useRef<AdminFormState | null>(null);
  const locale = useLocale();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [confirm, setConfirm] = useState(false);
  const [deleting, startDelete] = useTransition();
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: t("saved") });
    }
  }, [state, t, toast]);

  // A failed save with the first error in a tab not shown: open that tab once.
  useEffect(() => {
    if (state.status !== "error" || !state.fields || jumped.current === state) return;
    jumped.current = state;
    const first = Object.keys(state.fields)[0];
    if (first) setTab(SECTION_INFO_FIELDS.has(first) ? "info" : "content");
  }, [state, setTab]);

  const v = state.status === "error" ? state.values : undefined;
  const val = (name: string, fallback: string) => (v && typeof v[name] === "string" ? (v[name] as string) : fallback);
  const err = (name: string) => state.fields?.[name] && t(`errors.${state.fields[name]}` as "errors.generic");
  const list = (name: string, fallback: string[]) => (v ? ((v[name] as string[] | undefined) ?? []) : fallback);
  const specGroups = (groups: readonly SpecGroup[]) =>
    groups.map((g) => ({ ...g, label: t(`specGroups.${g.id}` as "specGroups.extra") }));
  const specLabels = { edit: t("specEdit"), pick: t("specPick"), done: t("specDone"), none: t("specNone"), extra: t("specGroups.extra"), hint: t("specHint") };
  const tr = initial.translations;

  const remove = () =>
    startDelete(async () => {
      try {
        const r = await deleteSectionAction(locale, productId, sectionId);
        if (r && !r.ok) toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
      } catch (e) {
        const redirect =
          typeof e === "object" &&
          e !== null &&
          "digest" in e &&
          String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
        if (!redirect) toast({ variant: "error", title: t("errors.generic") });
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {/* Save · Delete beside the title, always in view (user request 2026-11-21: tabs, the pictures may be many). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">{header}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2" data-testid="section-actions">
          <Button type="submit" form={formId} disabled={pending} aria-busy={pending || undefined} data-testid="section-save">
            <Save aria-hidden="true" className="size-4" />
            {pending ? t("saving") : t("save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirm(true)}
            className="text-cinnabar-500 light:text-cinnabar-600"
            data-testid="section-delete"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t("deleteSection")}
          </Button>
        </div>
      </div>
      {state.error && <FormError message={t(`errors.${state.error}` as "errors.generic")} />}
      <EditorTabBar
        idPrefix="section"
        label={t("sectionTabsLabel")}
        value={tab}
        onSelect={setTab}
        items={[
          { id: "info", label: t("tabs.info"), Icon: Settings2 },
          { id: "content", label: t("tabs.content"), Icon: Languages },
          { id: "media", label: t("tabs.media"), Icon: Images, count: mediaCount },
        ]}
      />
      {/* Every panel stays mounted (hidden): typed text survives a tab switch and is saved with the form. */}
      <form id={formId} action={formAction} noValidate hidden={tab === "media"} className="flex-col" data-testid="section-form">
        <div role="tabpanel" id="section-panel-info" aria-labelledby="section-tab-info" hidden={tab !== "info"}>
          <PackCard testId="section-info">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={t("assetCount")}
                  name="assetCount"
                  inputMode="numeric"
                  defaultValue={val("assetCount", String(initial.assetCount))}
                  error={err("assetCount")}
                />
                <TextField
                  label={t("sortOrder")}
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={val("sortOrder", String(initial.sortOrder))}
                  error={err("sortOrder")}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SpecPicker
                  legend={t("resolution")}
                  name="resolution"
                  groups={specGroups(RESOLUTION_GROUPS)}
                  selected={list("resolution", splitResolution(initial.resolution))}
                  labels={specLabels}
                  shownChips={4}
                  error={err("resolution")}
                  testId="spec-resolution"
                />
                <SpecPicker
                  legend={t("fileFormats")}
                  name="fileFormats"
                  groups={specGroups(FILE_FORMAT_GROUPS)}
                  selected={list("fileFormats", initial.fileFormats)}
                  labels={specLabels}
                  shownChips={6}
                  error={err("fileFormats")}
                  testId="spec-formats"
                />
              </div>

          </PackCard>
        </div>
        <div role="tabpanel" id="section-panel-content" aria-labelledby="section-tab-content" hidden={tab !== "content"}>
          <PackCard testId="section-content">
              <LocaleTabs
                idPrefix="section"
                errorIn={(l) => Object.keys(state.fields ?? {}).some((k) => k.startsWith(`${l}.`))}
                missing={(l) => !tr[l].summary}
                panel={(l) => (
                  <>
                    <TextArea
                      label={t("summary")}
                      name={`${l}.summary`}
                      defaultValue={val(`${l}.summary`, tr[l].summary)}
                      error={err(`${l}.summary`)}
                      rows={3}
                      lang={l}
                    />
                    <TextArea
                      label={t("contentsList")}
                      name={`${l}.contentsList`}
                      defaultValue={val(`${l}.contentsList`, tr[l].contentsList.join("\n"))}
                      hint={t("linesHint")}
                      error={err(`${l}.contentsList`)}
                      rows={5}
                      lang={l}
                    />
                  </>
                )}
              />

            <p className="text-xs text-pretty text-ivory-500">{t("contentIntro")}</p>
          </PackCard>
        </div>
      </form>
      <div role="tabpanel" id="section-panel-media" aria-labelledby="section-tab-media" hidden={tab !== "media"}>
        {gallery}
      </div>
      <Modal
        open={confirm}
        onOpenChange={(o) => !deleting && setConfirm(o)}
        title={t("deleteSection")}
        description={t("deleteSectionText")}
        closeLabel={t("deleteCancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            className="border-cinnabar-600 text-cinnabar-500 light:text-cinnabar-600"
            disabled={deleting}
            onClick={remove}
            data-testid="section-delete-confirm"
          >
            {t("deleteConfirm")}
          </Button>
          <Button variant="ghost" disabled={deleting} onClick={() => setConfirm(false)}>
            {t("deleteCancel")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
