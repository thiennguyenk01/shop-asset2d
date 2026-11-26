"use client";

import { ArrowDown, ArrowUp, ExternalLink, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { ContactIcon } from "@/components/layout/contact-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  CONTACT_INPUT_MAX,
  contactLink,
  normalizeContactValue,
  type ContactKind,
  type ContactSetting,
} from "@backend/lib/contact/channels";
import { saveContactAction, type ContactFormState } from "@backend/modules/settings/admin-actions";
import { TextField } from "./fields";

const INITIAL: ContactFormState = { status: "idle" };

type Rows = { order: ContactKind[]; values: Record<ContactKind, string>; enabled: Record<ContactKind, boolean> };

const fromSettings = (list: ContactSetting[]): Rows => ({
  order: list.map((c) => c.kind),
  values: Object.fromEntries(list.map((c) => [c.kind, c.value])) as Record<ContactKind, string>,
  enabled: Object.fromEntries(list.map((c) => [c.kind, c.enabled])) as Record<ContactKind, boolean>,
});

/**
 * Contact channels of the chat button (user choice 2026-11-26): one row per channel (icon, the text to fill,
 * "Show", move up / down). The link each value opens is shown under the field ("Try it") while it is valid; the
 * server checks again on save. `names` = the channel names as the shop shows them.
 */
export function ContactForm({ initial, names }: { initial: ContactSetting[]; names: Record<ContactKind, string> }) {
  const t = useTranslations("adminSettings");
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(saveContactAction, INITIAL);
  const [rows, setRows] = useState<Rows>(() => fromSettings(initial));
  const shown = useRef<number | undefined>(undefined);

  // After a save the page refreshes with the stored (normalized) values: show those. Compared as text, so a
  // refresh by another form of the page (same stored values) keeps what is being typed here.
  const stored = JSON.stringify(initial);
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setRows(fromSettings(initial));
  }

  // A field typed again after a refused save drops its error (the server checks again on the next save).
  const [answered, setAnswered] = useState(state);
  const [retyped, setRetyped] = useState<ReadonlySet<ContactKind>>(new Set());
  if (answered !== state) {
    setAnswered(state);
    setRetyped(new Set());
  }

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: state.changed ? t("saved") : t("unchanged") });
    }
  }, [state, t, toast]);

  const move = (i: number, by: -1 | 1) =>
    setRows((r) => {
      const order = [...r.order];
      [order[i], order[i + by]] = [order[i + by]!, order[i]!];
      return { ...r, order };
    });

  const links = Object.fromEntries(
    rows.order.map((kind) => {
      const v = normalizeContactValue(kind, rows.values[kind]);
      return [kind, v.ok && v.value ? contactLink(kind, v.value).href : null];
    }),
  ) as Record<ContactKind, string | null>;
  const visibleCount = rows.order.filter((k) => rows.enabled[k] && links[k]).length;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="contact-form">
      {state.status === "error" && state.error && (
        <FormError message={t(`errors.${state.error}` as "errors.generic")} />
      )}
      <ul className="flex flex-col divide-y divide-bronze-700 rounded-xl border border-bronze-700">
        {rows.order.map((kind, i) => {
          const error = state.status === "error" && !retyped.has(kind) ? state.fields?.[kind] : undefined;
          return (
            <li
              key={kind}
              className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start"
              data-testid={`contact-row-${kind}`}
            >
              <input type="hidden" name="order" value={kind} />
              <ContactIcon kind={kind} className={!rows.enabled[kind] || !links[kind] ? "opacity-50" : undefined} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <TextField
                  label={names[kind]}
                  name={`value.${kind}`}
                  value={rows.values[kind]}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRows((r) => ({ ...r, values: { ...r.values, [kind]: value } }));
                    setRetyped((s) => (s.has(kind) ? s : new Set(s).add(kind)));
                  }}
                  maxLength={CONTACT_INPUT_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={kind === "hotline" || kind === "zalo" ? "tel" : kind === "email" ? "email" : undefined}
                  hint={t(`contactHints.${kind}`)}
                  error={error ? t(`contactErrors.${error}`, { max: CONTACT_INPUT_MAX }) : undefined}
                />
                {links[kind] && !error && (
                  <a
                    href={links[kind]!}
                    target={kind === "hotline" || kind === "email" ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 self-start text-xs break-all text-gold-300 hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                    {t("contactTry")}: {links[kind]}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1 sm:pt-7">
                <Switch
                  className="mr-2"
                  label={t("contactShow")}
                  name={`enabled.${kind}`}
                  checked={rows.enabled[kind]}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setRows((r) => ({ ...r, enabled: { ...r.enabled, [kind]: on } }));
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("contactUp", { name: names[kind] })}
                  title={t("contactUp", { name: names[kind] })}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === rows.order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("contactDown", { name: names[kind] })}
                  title={t("contactDown", { name: names[kind] })}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} data-testid="contact-submit">
          <Save aria-hidden="true" className="size-4" />
          {pending ? t("saving") : t("save")}
        </Button>
        <p className="text-xs text-ivory-500" data-testid="contact-visible-count">
          {t("contactVisible", { count: visibleCount })}
        </p>
      </div>
    </form>
  );
}
