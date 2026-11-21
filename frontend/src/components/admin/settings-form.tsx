"use client";

import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@backend/i18n/routing";
import {
  EXTRA_COUNT_MAX,
  EXTRA_COUNT_MIN,
  EXTRA_PRICE_MAX_VND,
  EXTRA_PRICE_MIN_VND,
  type ExtraDownloadsSettings,
} from "@backend/lib/admin/settings-rules";
import { formatVnd } from "@backend/lib/format";
import { saveSettingsAction, type AdminSettingsFormState } from "@backend/modules/settings/admin-actions";
import { TextField } from "./fields";

const INITIAL: AdminSettingsFormState = { status: "idle" };

/**
 * The "buy more downloads" offer for free packs (GĐ5.6, DECISIONS #35): downloads per purchase and price.
 * New orders use it at once; orders already placed keep theirs.
 */
export function SettingsForm({ initial }: { initial: ExtraDownloadsSettings }) {
  const t = useTranslations("adminSettings");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(saveSettingsAction, INITIAL);
  const shown = useRef<number | undefined>(undefined);
  const v = state.status === "error" ? state.values : undefined;

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: state.changed ? t("saved") : t("unchanged") });
    }
  }, [state, t, toast]);

  const vnd = (n: number) => formatVnd(n, locale);
  const err = (name: "extraDownloadsCount" | "extraDownloadsPriceVnd") => {
    const key = state.fields?.[name];
    if (!key) return undefined;
    const range =
      name === "extraDownloadsCount"
        ? { min: String(EXTRA_COUNT_MIN), max: String(EXTRA_COUNT_MAX) }
        : { min: vnd(EXTRA_PRICE_MIN_VND), max: vnd(EXTRA_PRICE_MAX_VND) };
    return t(`errors.${key}` as "errors.generic", range);
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" data-testid="settings-form">
      {state.status === "error" && state.error && (
        <FormError message={t(`errors.${state.error}` as "errors.generic")} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("extraCount")}
          name="extraDownloadsCount"
          inputMode="numeric"
          defaultValue={v?.extraDownloadsCount ?? String(initial.count)}
          hint={t("extraCountHint", { min: EXTRA_COUNT_MIN, max: EXTRA_COUNT_MAX })}
          error={err("extraDownloadsCount")}
        />
        <TextField
          label={t("extraPrice")}
          name="extraDownloadsPriceVnd"
          inputMode="numeric"
          defaultValue={v?.extraDownloadsPriceVnd ?? String(initial.priceVnd)}
          hint={t("extraPriceHint", { min: vnd(EXTRA_PRICE_MIN_VND), max: vnd(EXTRA_PRICE_MAX_VND) })}
          error={err("extraDownloadsPriceVnd")}
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="self-start"
        data-testid="settings-submit"
      >
        <Save aria-hidden="true" className="size-4" />
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
