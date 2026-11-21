"use client";

import { AlertCircle, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@backend/i18n/routing";
import type { CouponProblem } from "@backend/lib/cart/coupon";
import { formatVnd } from "@backend/lib/format";
import { removeCouponAction, type CouponFormState } from "@backend/modules/cart/actions";

type Action = (prev: CouponFormState, form: FormData) => Promise<CouponFormState>;

/** What the server says about the code currently applied (re-checked on every render). */
export type AppliedCoupon = { code: string; ok: true; discountVnd: number } | { code: string; ok: false; problem: CouponProblem; minTotalVnd?: number };

/**
 * Coupon field in the cart summary (CLAUDE.md §5.5 "Mã giảm giá nếu có"). Empty → input + Apply.
 * Applied → the code as a chip with its discount, or why it no longer counts (e.g. the cart went under the
 * minimum), and a Remove button. All checks happen on the server.
 */
export function CouponBox({ action, applied, locale }: { action: Action; applied: AppliedCoupon | null; locale: Locale }) {
  const t = useTranslations("cart.coupon");
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [removing, startRemove] = useTransition();
  const inputId = useId();
  const toasted = useRef<CouponFormState | null>(null);

  useEffect(() => {
    if (state.status !== "applied" || toasted.current === state) return;
    toasted.current = state;
    toast({ variant: "success", title: t("applied", { code: state.code ?? "" }) });
  }, [state, t, toast]);

  const problemText = (problem: CouponProblem | "format" | "tooManyAttempts", minTotalVnd?: number, retryMinutes?: number) =>
    t(`problems.${problem}`, { min: minTotalVnd !== undefined ? formatVnd(minTotalVnd, locale) : "", minutes: retryMinutes ?? 1 });

  if (applied) {
    return (
      <div className="flex flex-col gap-2" data-testid="coupon-applied">
        <div className="flex items-center gap-2 rounded-xl border border-bronze-600 px-3 py-2">
          <Tag aria-hidden="true" className={applied.ok ? "size-4 shrink-0 text-jade-400" : "size-4 shrink-0 text-ivory-500"} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-wide text-ivory-100">{applied.code}</span>
          <button
            type="button"
            disabled={removing}
            aria-label={t("remove", { code: applied.code })}
            title={t("remove", { code: applied.code })}
            data-testid="coupon-remove"
            onClick={() =>
              startRemove(async () => {
                try {
                  await removeCouponAction();
                  toast({ variant: "success", title: t("removed") });
                } catch {
                  toast({ variant: "error", title: t("problems.generic") });
                }
              })
            }
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ivory-500 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {!applied.ok && (
          <p role="status" className="flex items-start gap-1.5 text-xs text-pretty text-cinnabar-500 light:text-cinnabar-600" data-testid="coupon-warning">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {t("notCounting", { reason: problemText(applied.problem, applied.minTotalVnd) })}
          </p>
        )}
      </div>
    );
  }

  const error = state.status === "error" && state.problem ? problemText(state.problem, state.minTotalVnd, state.retryMinutes) : null;
  return (
    <form action={formAction} className="flex flex-col gap-1.5" data-testid="coupon-form">
      <label htmlFor={inputId} className="text-sm font-medium text-ivory-100">
        {t("label")}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          name="code"
          defaultValue={state.value}
          placeholder={t("placeholder")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-10 min-w-0 flex-1 rounded-xl border border-bronze-600 bg-ink-900 px-3 text-base text-ivory-100 uppercase outline-hidden placeholder:text-ivory-500 placeholder:normal-case focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25 aria-[invalid=true]:border-cinnabar-500 sm:text-sm"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t("applying") : t("apply")}
        </Button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-cinnabar-500 light:text-cinnabar-600">
          {error}
        </p>
      )}
    </form>
  );
}
