"use client";

import { CheckCircle2, CloudUpload, LoaderCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type DragEvent } from "react";
import { ACCEPT, planUpload, type UploadTarget } from "@backend/lib/admin/upload-rules";
import { cn } from "@/lib/cn";
import { finishUploadAction, startUploadAction } from "@backend/modules/product/admin-media-actions";

type Row = {
  id: number;
  name: string;
  progress: number;
  state: "uploading" | "checking" | "done" | "error";
  error?: string;
};

/**
 * PUT the bytes with progress (fetch has no upload progress). Resolves with the HTTP status (0 = network error).
 * `headers` come from the server: with R2 they are part of the presigned URL's signature (GĐ7.5).
 */
function put(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.onabort = () => resolve(0);
    xhr.send(file);
  });
}

const HTTP_ERROR: Record<number, string> = { 403: "forbidden", 404: "badTicket", 409: "badTicket", 413: "tooLarge" };

/**
 * Admin upload box (GĐ5.3): drop or pick files → for each one: ask the server for a ticket (it checks type, size,
 * where it goes) → send the bytes with a progress bar → the server checks the real content and adds the item.
 * Files go one after another so a big archive does not compete with itself; the page refreshes after each one.
 */
export function Uploader({
  productId,
  target,
  sectionId,
  versionId,
  multiple,
  testId,
  tile,
}: {
  productId: string;
  target: UploadTarget;
  sectionId?: string | null;
  versionId?: string | null;
  multiple?: boolean;
  testId?: string;
  /** Drawn as the last cell of a picture grid (its parent is the grid); progress rows span the whole grid. */
  tile?: boolean;
}) {
  const t = useTranslations("adminMedia");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);
  const busy = rows.some((r) => r.state === "uploading" || r.state === "checking");
  const seq = useRef(0);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function uploadOne(file: File) {
    const id = ++seq.current;
    setRows((rs) => [
      ...rs.filter((r) => r.state !== "done"),
      { id, name: file.name, progress: 0, state: "uploading" },
    ]);
    const fail = (error: string) => update(id, { state: "error", error });

    // Same rules as the server, so an obvious mistake is shown without a round trip.
    const plan = planUpload(target, file.name, file.size);
    if (!plan.ok) return fail(plan.error);
    try {
      const start = await startUploadAction({
        productId,
        target,
        sectionId: sectionId ?? null,
        versionId: versionId ?? null,
        filename: file.name,
        size: file.size,
      });
      if (!start.ok) return fail(start.error);
      const status = await put(start.url, start.headers, file, (p) => update(id, { progress: p }));
      if (status < 200 || status >= 300) return fail(HTTP_ERROR[status] ?? "uploadFailed");
      update(id, { state: "checking", progress: 1 });
      const finished = await finishUploadAction(start.ticket);
      if (!finished.ok) return fail(finished.error);
      update(id, { state: "done" });
    } catch {
      fail("uploadFailed");
    }
  }

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = multiple ? [...files] : [files[0]];
    for (const f of list) await uploadOne(f);
    if (input.current) input.current.value = "";
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) void handle(e.dataTransfer.files);
  };

  return (
    <div className={tile ? "contents" : "flex flex-col gap-2"} data-testid={testId}>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-bronze-600 px-4 py-5 text-center transition-colors hover:border-gold-500 hover:bg-gold-500/5 has-focus-visible:ring-2 has-focus-visible:ring-gold-500/40",
          tile && "min-h-40 justify-center sm:aspect-[4/3] sm:min-h-0",
          over && "border-gold-500 bg-gold-500/10",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <CloudUpload aria-hidden="true" className="size-6 text-gold-400" />
        <span className="text-sm font-medium text-ivory-100">{t(`pick.${target}`)}</span>
        <span className="text-xs text-pretty text-ivory-500">{t(`accept.${target}`)}</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPT[target]}
          multiple={multiple}
          disabled={busy}
          className="sr-only"
          onChange={(e) => void handle(e.currentTarget.files)}
          data-testid={testId ? `${testId}-input` : undefined}
        />
      </label>

      {rows.length > 0 && (
        <ul className={cn("flex flex-col gap-1.5", tile && "col-span-full")} aria-live="polite">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 rounded-lg bg-ink-950/40 px-3 py-2 text-sm"
              data-testid="upload-row"
              data-state={r.state}
            >
              <div className="flex items-center gap-2">
                {r.state === "done" ? (
                  <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-jade-400" />
                ) : r.state === "error" ? (
                  <XCircle aria-hidden="true" className="size-4 shrink-0 text-cinnabar-500" />
                ) : (
                  <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-gold-400" />
                )}
                <span className="min-w-0 flex-1 break-all text-ivory-100">{r.name}</span>
                <span className="shrink-0 text-xs text-ivory-500 tabular-nums">
                  {r.state === "uploading" ? `${Math.round(r.progress * 100)}%` : t(`state.${r.state}`)}
                </span>
              </div>
              {r.state === "uploading" && (
                <div
                  className="h-1 overflow-hidden rounded-full bg-ivory-100/10"
                  role="progressbar"
                  aria-valuenow={Math.round(r.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={r.name}
                >
                  <div className="h-full bg-gold-500 transition-[width]" style={{ width: `${r.progress * 100}%` }} />
                </div>
              )}
              {r.state === "error" && (
                <p className="text-xs text-cinnabar-500 light:text-cinnabar-600" data-testid="upload-error">
                  {t(`errors.${r.error ?? "uploadFailed"}` as "errors.uploadFailed")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
