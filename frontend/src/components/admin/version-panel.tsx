"use client";

import { FileArchive, Plus, Rocket, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { sizeParts } from "@backend/lib/admin/upload-rules";
import type { AdminFormState } from "@backend/modules/product/admin-actions";
import {
  deleteFileAction,
  deleteVersionAction,
  releaseVersionAction,
  saveVersionAction,
  type MediaActionResult,
} from "@backend/modules/product/admin-media-actions";
import type { AdminVersion, AdminVersions } from "@backend/modules/product/admin-media-service";
import { TextArea, TextField } from "./fields";
import { LocaleTabs } from "./locale-tabs";
import { Uploader } from "./uploader";

const INITIAL: AdminFormState = { status: "idle" };
type Confirm = {
  title: string;
  text: string;
  confirm: string;
  run: () => Promise<MediaActionResult>;
  success: string;
  testId: string;
};

/**
 * Versions & download files (GĐ5.3). Customers always download the CURRENT version. A draft version takes
 * files; once released (first publish of the pack, or "Release" for a later version) it never changes.
 */
export function VersionPanel({
  productId,
  versions,
  packPublished,
  bare,
}: {
  productId: string;
  versions: AdminVersions;
  packPublished: boolean;
  /** Inside a tab of the pack editor: no frame and title of its own (the tab names it). */
  bare?: boolean;
}) {
  const t = useTranslations("adminMedia");
  const format = useFormatter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const run = (c: Confirm) =>
    startTransition(async () => {
      try {
        const r = await c.run();
        if (!r.ok) toast({ variant: "error", title: t(`errors.${r.error}` as "errors.generic") });
        else toast({ variant: "success", title: c.success });
      } catch {
        toast({ variant: "error", title: t("errors.generic") });
      }
    });

  const size = (bytes: number) => {
    const p = sizeParts(bytes);
    return `${format.number(p.value)} ${p.unit}`;
  };

  // A render function, not a component: a nested component would remount (and lose an upload in progress) on every render.
  const files = (v: AdminVersion, editable: boolean) => (
    <div className="flex flex-col gap-2">
      {v.files.length === 0 ? (
        <p className="text-sm text-ivory-500">{t("noFiles")}</p>
      ) : (
        <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
          {v.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="version-file">
              <FileArchive aria-hidden="true" className="size-5 shrink-0 text-gold-400" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm break-all text-ivory-100">{f.filename}</span>
                <span className="text-xs text-ivory-500 tabular-nums">
                  {size(f.sizeBytes)} · SHA-256 <span title={f.sha256}>{f.sha256.slice(0, 12)}…</span>
                </span>
              </div>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("deleteFile")}
                  disabled={pending}
                  className="text-cinnabar-500 light:text-cinnabar-600"
                  onClick={() =>
                    setConfirm({
                      title: t("deleteFile"),
                      text: t("deleteFileText", { name: f.filename }),
                      confirm: t("deleteConfirm"),
                      run: () => deleteFileAction(productId, f.id),
                      success: t("fileDeleted"),
                      testId: "file-delete-confirm",
                    })
                  }
                  data-testid="file-delete"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && <Uploader productId={productId} target="file" versionId={v.id} testId="file-upload" />}
    </div>
  );

  const header = (v: AdminVersion, label: string) => (
    <header className="flex flex-wrap items-center gap-2">
      <h3 className="text-sm font-semibold text-ivory-100 tabular-nums">{t("versionName", { version: v.version })}</h3>
      <Badge variant={v.releasedAt ? "free" : "neutral"}>{label}</Badge>
      {v.releasedAt && (
        <span className="text-xs text-ivory-500">
          {t("releasedOn", { date: format.dateTime(v.releasedAt, { dateStyle: "medium" }) })}
        </span>
      )}
    </header>
  );

  const { current, draft, history } = versions;
  return (
    <section
      className={bare ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-5"}
      data-testid="version-panel"
    >
      {bare ? (
        <p className="text-xs text-pretty text-ivory-500">{t("versionsIntro")}</p>
      ) : (
        <header className="flex flex-col gap-0.5">
          <h2 className="font-sans text-base font-semibold text-ivory-100">{t("versionsTitle")}</h2>
          <p className="text-xs text-pretty text-ivory-500">{t("versionsIntro")}</p>
        </header>
      )}

      {current && (
        <div
          className="flex flex-col gap-3 rounded-xl bg-ink-950/40 p-4"
          data-testid="version-current"
          data-released={current.releasedAt ? "true" : "false"}
        >
          {header(current, current.releasedAt ? t("current") : t("draftFirst"))}
          {!current.releasedAt && <p className="text-xs text-pretty text-ivory-500">{t("draftFirstNote")}</p>}
          {current.releasedAt && packPublished && !draft && (
            <p className="text-xs text-pretty text-ivory-500">{t("lockedNote")}</p>
          )}
          {files(current, !current.releasedAt)}
        </div>
      )}

      {draft && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-gold-500/40 bg-gold-500/5 p-4"
          data-testid="version-draft"
        >
          {header(draft, t("draft"))}
          <p className="text-xs text-pretty text-ivory-500">{t("draftNote")}</p>
          {files(draft, true)}
          <VersionForm productId={productId} version={draft} key={`${draft.id}-${draft.version}`} />
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-between">
            <Button
              variant="jade"
              disabled={pending || draft.files.length === 0}
              onClick={() =>
                setConfirm({
                  title: t("releaseTitle", { version: draft.version }),
                  text: t("releaseText"),
                  confirm: t("release"),
                  run: () => releaseVersionAction(productId, draft.id),
                  success: t("released", { version: draft.version }),
                  testId: "version-release-confirm",
                })
              }
              data-testid="version-release"
            >
              <Rocket aria-hidden="true" className="size-4" />
              {t("release")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              className="text-cinnabar-500 light:text-cinnabar-600"
              onClick={() =>
                setConfirm({
                  title: t("deleteDraft"),
                  text: t("deleteDraftText"),
                  confirm: t("deleteConfirm"),
                  run: () => deleteVersionAction(productId, draft.id),
                  success: t("draftDeleted"),
                  testId: "version-delete-confirm",
                })
              }
              data-testid="version-delete"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t("deleteDraft")}
            </Button>
          </div>
          {draft.files.length === 0 && <p className="text-xs text-ivory-500">{t("releaseNeedsFile")}</p>}
        </div>
      )}

      {versions.canCreate && (
        <details className="group flex flex-col gap-3 open:rounded-xl open:border open:border-bronze-700 open:p-4" data-testid="version-new">
          <summary className="inline-flex h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-xl border border-gold-500/60 px-4 text-sm font-semibold text-gold-300 transition-colors select-none hover:bg-gold-500/10 focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <Plus aria-hidden="true" className="size-4 transition-transform group-open:rotate-45" />
            {t("newVersion")}
          </summary>
          <p className="mt-3 text-xs text-pretty text-ivory-500">{t("newVersionIntro")}</p>
          <div className="mt-3">
            <VersionForm productId={productId} version={null} suggested={versions.suggested} />
          </div>
        </details>
      )}

      {history.length > 0 && (
        <details className="rounded-xl border border-bronze-700 p-4" data-testid="version-history">
          <summary className="cursor-pointer text-sm text-ivory-300">{t("history", { count: history.length })}</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ivory-300 tabular-nums"
              >
                <span className="font-medium text-ivory-100">{t("versionName", { version: v.version })}</span>
                {v.releasedAt && (
                  <span className="text-xs text-ivory-500">
                    {t("releasedOn", { date: format.dateTime(v.releasedAt, { dateStyle: "medium" }) })}
                  </span>
                )}
                <span className="text-xs text-ivory-500">{t("fileCount", { count: v.files.length })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal
        open={confirm !== null}
        onOpenChange={(o) => !pending && !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.text}
        closeLabel={t("cancel")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              if (c) run(c);
            }}
            data-testid={confirm?.testId}
          >
            {confirm?.confirm}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm(null)}>
            {t("cancel")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

/** Number + "what's new" (optional; one language is enough, user request 2026-11-21) of a new or draft version. */
function VersionForm({
  productId,
  version,
  suggested,
}: {
  productId: string;
  version: AdminVersion | null;
  suggested?: string;
}) {
  const t = useTranslations("adminMedia");
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(
    saveVersionAction.bind(null, productId, version?.id ?? null),
    INITIAL,
  );
  const shown = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: version ? t("versionSaved") : t("versionCreated") });
    }
  }, [state, t, toast, version]);

  const v = state.status === "error" ? state.values : undefined;
  const val = (name: string, fallback: string) => (v && typeof v[name] === "string" ? (v[name] as string) : fallback);
  const err = (name: string) => state.fields?.[name] && t(`errors.${state.fields[name]}` as "errors.generic");
  const log = version?.changelog ?? { vi: "", en: "", zh: "" };

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-3"
      data-testid={version ? "version-edit-form" : "version-create-form"}
    >
      {state.error && <FormError message={t(`errors.${state.error}` as "errors.generic")} />}
      <TextField
        label={t("versionLabel")}
        name="version"
        inputMode="decimal"
        defaultValue={val("version", version?.version ?? suggested ?? "")}
        hint={t("versionHint")}
        error={err("version")}
      />
      <LocaleTabs
        idPrefix={version ? `ver-${version.id}` : "ver-new"}
        errorIn={(l) => !!state.fields?.[`${l}.changelog`]}
        missing={() => false} // optional: never "missing"
        panel={(l) => (
          <TextArea
            label={t("changelog")}
            name={`${l}.changelog`}
            defaultValue={val(`${l}.changelog`, log[l])}
            hint={t("changelogHint")}
            error={err(`${l}.changelog`)}
            rows={3}
            lang={l}
          />
        )}
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="self-start"
        data-testid={version ? "version-save" : "version-create"}
      >
        {pending ? t("saving") : version ? t("saveVersion") : t("createVersion")}
      </Button>
    </form>
  );
}
