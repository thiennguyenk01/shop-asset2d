"use client";

import { Check, Ticket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { Locale } from "@backend/i18n/routing";
import { cn } from "@/lib/cn";
import { gatewayLimits } from "@backend/lib/payment/limits";
import { buyExtraDownloadsAction } from "@backend/modules/order/actions";

const PERKS = ["instant", "noExpiry", "thisPack"] as const;

export type ExtraDownloadsOffer = { count: number; price: string; isDemo: boolean };

/**
 * "Buy N more downloads" of a free pack (CLAUDE.md §5, step 4.6) — shown where a free pack has no downloads
 * left (library row, pack page). One button with the price on it → a small confirm box (what you get, the
 * price, demo note) → straight to the payment gateway; no cart, no coupon. The server sets count and price.
 */
export function BuyDownloadsButton({
  productId,
  title,
  offer,
  size = "sm",
  className,
}: {
  productId: string;
  title: string;
  offer: ExtraDownloadsOffer;
  size?: "sm" | "lg";
  className?: string;
}) {
  const t = useTranslations("extraDownloads");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const pay = () =>
    startTransition(async () => {
      try {
        // Success: the action redirects to the payment gateway (Next navigates). Failures come back as data.
        const result = await buyExtraDownloadsAction(locale, productId);
        if (result?.status === "error") toast({ variant: "error", title: t(`errors.${result.reason}`, gatewayLimits(locale as Locale, result.range)) });
      } catch (e) {
        if (!isRedirect(e)) toast({ variant: "error", title: t("errors.generic") });
      }
    });

  return (
    <>
      <Button size={size} className={cn(size === "lg" && "w-full", className)} onClick={() => setOpen(true)} data-testid="buy-downloads">
        <Ticket aria-hidden="true" className="size-4" />
        {t("buy", { count: offer.count, price: offer.price })}
      </Button>

      <Modal
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("dialog.title", { count: offer.count })}
        description={t("dialog.description", { title })}
        closeLabel={tc("close")}
        className="max-w-md"
      >
        <div className="flex flex-col gap-5" data-testid="buy-downloads-dialog">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gold-500/40 bg-gold-500/5 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-ivory-100">
              <Ticket aria-hidden="true" className="size-4 text-gold-400" />
              {t("dialog.amountLabel", { count: offer.count })}
            </span>
            <span className="text-xl font-semibold text-gold-300 tabular-nums" data-testid="buy-downloads-price">
              {offer.price}
            </span>
          </div>

          <ul className="flex flex-col gap-2.5">
            {PERKS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm text-pretty text-ivory-300">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-jade-400" />
                {t(`dialog.perks.${key}`)}
              </li>
            ))}
          </ul>

          {offer.isDemo && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-ivory-500">
              <Badge variant="demo">{tc("demo")}</Badge>
              {t("dialog.demoNote")}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" disabled={pending} aria-busy={pending || undefined} onClick={pay} data-testid="buy-downloads-pay">
              {pending ? t("dialog.paying") : t("dialog.pay", { price: offer.price })}
            </Button>
            <Button size="lg" variant="ghost" className="w-full" disabled={pending} onClick={() => setOpen(false)}>
              {t("dialog.later")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** next/navigation's redirect() throws an error tagged with this digest; it must keep propagating. */
function isRedirect(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
