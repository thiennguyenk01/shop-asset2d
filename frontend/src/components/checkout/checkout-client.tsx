"use client";

import { Check, CheckCircle2, Copy, ShieldCheck, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { gatewayLimits } from "@backend/lib/payment/limits";
import type { PlaceOrderState } from "@backend/modules/order/actions";
import type { DemoPayState } from "@backend/modules/payment/actions";

type PlaceOrderAction = (prev: PlaceOrderState, form: FormData) => Promise<PlaceOrderState>;

/** "Place order": posts only the total the buyer is looking at; everything else is re-read on the server. */
export function PlaceOrderForm({ action, totalVnd }: { action: PlaceOrderAction; totalVnd: number }) {
  const t = useTranslations("checkout");
  const locale = useLocale() as Locale;
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="flex flex-col gap-2" data-testid="place-order-form">
      <input type="hidden" name="expectedTotal" value={totalVnd} />
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending || undefined} data-testid="place-order">
        <ShieldCheck aria-hidden="true" className="size-4" />
        {pending ? t("placing") : t("confirm")}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-pretty text-cinnabar-500 light:text-cinnabar-600" data-testid="place-order-error">
          {t(`errors.${state.reason}`, gatewayLimits(locale, state.range))}
        </p>
      )}
    </form>
  );
}

/** Succeed / fail buttons of the Demo gateway. They only send a signed event; the server decides the rest. */
export function DemoPaymentButtons({ action }: { action: (prev: DemoPayState, form: FormData) => Promise<DemoPayState> }) {
  const t = useTranslations("checkout.demo");
  const [state, formAction, pending] = useActionState<DemoPayState, FormData>(action, { status: "idle" });
  const [picked, setPicked] = useState<"SUCCEEDED" | "FAILED" | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-2" data-testid="demo-form">
      <div className="flex flex-col gap-2">
        <Button type="submit" name="outcome" value="SUCCEEDED" size="lg" variant="jade" disabled={pending} onClick={() => setPicked("SUCCEEDED")} data-testid="demo-succeed">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {pending && picked === "SUCCEEDED" ? t("processing") : t("succeed")}
        </Button>
        <Button type="submit" name="outcome" value="FAILED" size="lg" variant="danger" disabled={pending} onClick={() => setPicked("FAILED")} data-testid="demo-fail">
          <XCircle aria-hidden="true" className="size-4" />
          {pending && picked === "FAILED" ? t("processing") : t("fail")}
        </Button>
      </div>
      {state.status === "error" && !pending && (
        <p role="alert" className="text-sm text-cinnabar-500 light:text-cinnabar-600">
          {t("error")}
        </p>
      )}
    </form>
  );
}

/** While an order is PENDING, re-render the result page every few seconds (the page itself only reads). */
export function OrderStatusPoller({ active, intervalMs = 2500, maxPolls = 120 }: { active: boolean; intervalMs?: number; maxPolls?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let polls = 0;
    const id = window.setInterval(() => {
      polls += 1;
      if (polls > maxPolls) window.clearInterval(id);
      else router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, maxPolls, router]);
  return null;
}

/** Copies one transfer detail (account number, amount, memo) — typing them by hand is where transfers go wrong. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("checkout.sepay");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="shrink-0"
      aria-label={t("copyLabel", { what: label })}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined);
      }}
    >
      {copied ? <Check aria-hidden="true" className="size-4 text-jade-400" /> : <Copy aria-hidden="true" className="size-4" />}
      <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
    </Button>
  );
}
