"use client";

import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@backend/i18n/routing";
import {
  COUPON_FIXED_MAX_VND,
  COUPON_FIXED_MIN_VND,
  COUPON_KINDS,
  COUPON_USES_MAX,
  type CouponKind,
} from "@backend/lib/admin/coupon-rules";
import { formatVnd } from "@backend/lib/format";
import type { AdminCouponFormState } from "@backend/modules/coupon/admin-actions";
import { CheckboxField, FormCard, SelectField, TextField } from "./fields";

export type CouponFormValues = {
  code: string;
  kind: CouponKind;
  value: string;
  minTotalVnd: string;
  /** datetime-local values in shop time (UTC+7), "" = none. */
  startsAt: string;
  endsAt: string;
  maxUses: string;
  maxUsesPerUser: string;
  isActive: boolean;
};

const INITIAL: AdminCouponFormState = { status: "idle" };

/**
 * Create / edit a coupon (GĐ5.6, DECISIONS #35). `locked` = someone used it: code, kind and value are shown but
 * cannot change (the server checks again). Dates are typed in shop time (UTC+7).
 */
export function CouponForm({
  mode,
  action,
  initial,
  locked,
}: {
  mode: "create" | "edit";
  action: (prev: AdminCouponFormState, form: FormData) => Promise<AdminCouponFormState>;
  initial: CouponFormValues;
  locked: boolean;
}) {
  const t = useTranslations("adminCoupons");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const shown = useRef<number | undefined>(undefined);
  const v = state.status === "error" && state.values ? state.values : null;
  const [kind, setKind] = useState<CouponKind>(initial.kind);

  useEffect(() => {
    if (state.status === "success" && state.savedAt && shown.current !== state.savedAt) {
      shown.current = state.savedAt;
      toast({ variant: "success", title: state.changed === false ? t("unchanged") : t("saved") });
    }
  }, [state, t, toast]);

  const vnd = (n: number) => formatVnd(n, locale);
  const fieldError = (name: string) => {
    const key = state.fields?.[name];
    if (!key) return undefined;
    return t(`errors.${key}` as "errors.generic", { min: vnd(COUPON_FIXED_MIN_VND), max: vnd(COUPON_FIXED_MAX_VND) });
  };
  const val = (name: keyof CouponFormValues) => (v ? (v[name] ?? "") : String(initial[name]));
  const lockHint = locked ? t("lockedHint") : undefined;
  // The select reports every change, so `kind` is also what was sent when the form comes back with errors.
  const shownKind = kind;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5" data-testid="admin-coupon-form">
      {state.status === "error" && state.error && (
        <FormError message={t(`errors.${state.error}` as "errors.generic")} />
      )}
      <FormCard title={t("sectionCode")} intro={locked ? t("lockedIntro") : t("sectionCodeIntro")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("code")}
            name="code"
            defaultValue={val("code")}
            readOnly={locked}
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            hint={lockHint ?? t("codeHint")}
            error={fieldError("code")}
            className="uppercase"
          />
          {locked ? (
            <>
              <input type="hidden" name="kind" value={initial.kind} />
              <SelectField
                label={t("kind")}
                name="kindShown"
                value={initial.kind}
                disabled
                hint={lockHint}
                options={[{ value: initial.kind, label: t(`kinds.${initial.kind}`) }]}
              />
            </>
          ) : (
            <SelectField
              label={t("kind")}
              name="kind"
              defaultValue={v?.kind ?? initial.kind}
              onValueChange={(k) => setKind(k as CouponKind)}
              error={fieldError("kind")}
              options={COUPON_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
            />
          )}
          <TextField
            label={shownKind === "PERCENT" ? t("valuePercent") : t("valueFixed")}
            name="value"
            inputMode="numeric"
            defaultValue={val("value")}
            readOnly={locked}
            hint={
              lockHint ??
              (shownKind === "PERCENT"
                ? t("valuePercentHint")
                : t("valueFixedHint", { min: vnd(COUPON_FIXED_MIN_VND), max: vnd(COUPON_FIXED_MAX_VND) }))
            }
            error={fieldError("value")}
          />
          <TextField
            label={t("minTotal")}
            name="minTotalVnd"
            inputMode="numeric"
            defaultValue={val("minTotalVnd")}
            hint={t("minTotalHint")}
            error={fieldError("minTotalVnd")}
          />
        </div>
      </FormCard>

      <FormCard title={t("sectionLimits")} intro={t("sectionLimitsIntro")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("startsAt")}
            name="startsAt"
            type="datetime-local"
            defaultValue={val("startsAt")}
            hint={t("dateHint")}
            error={fieldError("startsAt")}
          />
          <TextField
            label={t("endsAt")}
            name="endsAt"
            type="datetime-local"
            defaultValue={val("endsAt")}
            hint={t("dateHint")}
            error={fieldError("endsAt")}
          />
          <TextField
            label={t("maxUses")}
            name="maxUses"
            inputMode="numeric"
            defaultValue={val("maxUses")}
            hint={t("maxUsesHint", { max: COUPON_USES_MAX })}
            error={fieldError("maxUses")}
          />
          <TextField
            label={t("maxUsesPerUser")}
            name="maxUsesPerUser"
            inputMode="numeric"
            defaultValue={val("maxUsesPerUser")}
            hint={t("maxUsesPerUserHint")}
            error={fieldError("maxUsesPerUser")}
          />
        </div>
        <CheckboxField
          label={t("isActive")}
          name="isActive"
          hint={t("isActiveHint")}
          defaultChecked={v ? v.isActive === "on" : initial.isActive}
        />
      </FormCard>

      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="self-start"
        data-testid="admin-coupon-submit"
      >
        <Save aria-hidden="true" className="size-4" />
        {pending ? t("saving") : mode === "create" ? t("create") : t("save")}
      </Button>
    </form>
  );
}
