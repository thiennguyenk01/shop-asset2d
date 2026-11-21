"use client";

import { Gift, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FormError } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatAmountInput, MANUAL_NOTE_MAX } from "@backend/lib/admin/manual-order-rules";
import { ADMIN_NOTE_MAX } from "@backend/lib/admin/user-rules";
import { formatVnd } from "@backend/lib/format";
import { createManualOrderAction, type ManualOrderFormState } from "@backend/modules/order/admin-actions";
import { giftPackAction, type AdminUserFormState } from "@backend/modules/user/admin-actions";
import { SelectField, TextArea, TextField } from "./fields";

const MANUAL_INITIAL: ManualOrderFormState = { status: "idle" };
const GIFT_INITIAL: AdminUserFormState = { status: "idle" };
const MANUAL_FIELD_ERRORS = new Set(["pickPack", "tooManyPacks", "amountInvalid", "amountTooHigh", "noteRequired", "noteTooLong"]);
const GIFT_FIELD_ERRORS = new Set(["pickPack", "tooManyPacks", "tooLong"]);
const MODES = ["gift", "transfer"] as const;
type Mode = (typeof MODES)[number];

/**
 * Packs given to a customer by hand (user choice 2026-11-21), one box; a drop-down picks one of two kinds (only the
 * fields of that kind are shown — the amount only for a private transfer):
 * - "Gift" (GĐ5.5, DECISIONS #34): the ticked packs reach the customer's Library as gifts; no order, no money;
 *   optional note. Taken back from the Library list above.
 * - "Private transfer": the customer messaged the shop and paid by a private transfer. The Admin types the amount
 *   received (filled with the list price, or the linked transfer's amount; grouped as typed: 3.970.000) and how the
 *   customer paid; optionally links an unmatched transfer, which is then marked handled. A PAID order is created.
 * Both offer the Premium packs on sale the customer does not own; the server re-checks everything.
 */
export function ManualOrderPanel({
  userId,
  packs,
  transfers,
}: {
  userId: string;
  packs: { id: string; title: string; priceVnd: number }[];
  transfers: { id: string; label: string; amountVnd: number }[];
}) {
  const t = useTranslations("adminUsers.manual");
  const tu = useTranslations("adminUsers");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("gift");
  const [manual, manualAction, manualPending] = useActionState(createManualOrderAction.bind(null, userId), MANUAL_INITIAL);
  const [gift, giftAction, giftPending] = useActionState(giftPackAction.bind(null, userId), GIFT_INITIAL);
  const shownManual = useRef<number | undefined>(undefined);
  const shownGift = useRef<number | undefined>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [transferId, setTransferId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);

  const listPrice = useMemo(() => packs.filter((p) => picked.includes(p.id)).reduce((a, p) => a + p.priceVnd, 0), [packs, picked]);
  const linked = transfers.find((x) => x.id === transferId);
  // Until the Admin types an amount: the linked transfer's amount, else the packs' list price.
  const shownAmount = amountTouched
    ? amount
    : linked
      ? formatAmountInput(String(linked.amountVnd), locale)
      : picked.length
        ? formatAmountInput(String(listPrice), locale)
        : "";

  // A new answer from the server: clear the form after success, put back what was ticked/typed after an error
  // (React resets a form after its action ran). Adjusted while rendering, not in an effect (react.dev "You might not
  // need an effect"). The form is mounted again for every answer so the controlled boxes show the state again.
  const [answered, setAnswered] = useState({ manual, gift });
  const [round, setRound] = useState(0);
  if (answered.manual !== manual || answered.gift !== gift) {
    const fresh = answered.manual !== manual ? manual : gift;
    setAnswered({ manual, gift });
    setRound((r) => r + 1);
    if (fresh.status === "success") {
      setPicked([]);
      setTransferId("");
      setAmount("");
      setAmountTouched(false);
    } else if (fresh === manual && manual.status === "error" && manual.values) {
      setPicked(manual.values.productIds);
      setTransferId(manual.values.transferId);
      setAmount(formatAmountInput(manual.values.amount, locale));
      setAmountTouched(true);
    } else if (fresh === gift && gift.status === "error" && gift.values) {
      setPicked((gift.values.productId ?? "").split(",").filter(Boolean));
    }
  }

  useEffect(() => {
    if (manual.status === "success" && manual.savedAt && shownManual.current !== manual.savedAt) {
      shownManual.current = manual.savedAt;
      toast({ variant: "success", title: t("created", { code: manual.code ?? "" }) });
    }
  }, [manual, t, toast]);
  useEffect(() => {
    if (gift.status === "success" && gift.savedAt && shownGift.current !== gift.savedAt) {
      shownGift.current = gift.savedAt;
      toast({ variant: "success", title: tu("gifted") });
    }
  }, [gift, tu, toast]);

  const manualError = manual.status === "error" ? manual.error : undefined;
  const manualFieldError = manualError && MANUAL_FIELD_ERRORS.has(manualError) ? manualError : null;
  const giftError = gift.status === "error" ? gift.error : undefined;
  const giftFieldError = giftError && GIFT_FIELD_ERRORS.has(giftError) ? giftError : null;
  const packError =
    mode === "gift"
      ? giftFieldError === "pickPack" || giftFieldError === "tooManyPacks"
        ? tu(`errors.${giftFieldError}`)
        : null
      : manualFieldError === "pickPack" || manualFieldError === "tooManyPacks"
        ? t(`errors.${manualFieldError}`)
        : null;
  const pending = mode === "gift" ? giftPending : manualPending;

  const packList = (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-ivory-100">{t("packs")}</legend>
      <div className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-bronze-700 p-2 sm:grid-cols-2">
        {packs.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ivory-300 hover:bg-ivory-100/5 has-checked:text-gold-300"
          >
            <input
              type="checkbox"
              name="productId"
              value={p.id}
              checked={picked.includes(p.id)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))}
              className="size-4 shrink-0 cursor-pointer accent-gold-500"
            />
            <span className="min-w-0 flex-1 text-pretty">{p.title}</span>
            <span className="shrink-0 tabular-nums">{formatVnd(p.priceVnd, locale)}</span>
          </label>
        ))}
      </div>
      {packError && (
        <p className="text-xs text-cinnabar-500 light:text-cinnabar-600" role="alert">
          {packError}
        </p>
      )}
      {mode === "transfer" && (
        <p className="text-xs text-ivory-500 tabular-nums">{t("listPrice", { price: formatVnd(listPrice, locale) })}</p>
      )}
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-3">
      {manual.status === "success" && manual.code && (
        <p className="text-sm text-jade-400" role="status" data-testid="manual-order-created">
          {t("createdLine")}{" "}
          <Link href={`/admin/orders/${manual.code}`} className="font-medium tabular-nums underline">
            {manual.code}
          </Link>
        </p>
      )}
      {packs.length === 0 ? (
        <p className="text-sm text-pretty text-ivory-500" data-testid="manual-order-none">
          {t("none")}
        </p>
      ) : (
        <>
          <SelectField
            label={t("mode.label")}
            name="kind"
            value={mode}
            onValueChange={(m) => setMode(m === "transfer" ? "transfer" : "gift")}
            hint={t(`mode.${mode}Hint`)}
            className="sm:max-w-xs"
            testId="manual-mode"
            options={MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
          />

          {mode === "gift" ? (
            <form key={`gift-${round}`} action={giftAction} noValidate className="flex flex-col gap-3" data-testid="gift-form">
              {giftError && !giftFieldError && <FormError message={tu(`errors.${giftError}` as "errors.generic")} />}
              {packList}
              <TextArea
                label={tu("note")}
                name="note"
                defaultValue={gift.status === "error" ? (gift.values?.note ?? "") : ""}
                hint={tu("noteHint", { max: ADMIN_NOTE_MAX })}
                error={giftFieldError === "tooLong" ? tu("errors.tooLong", { max: ADMIN_NOTE_MAX }) : undefined}
                maxLength={ADMIN_NOTE_MAX}
                rows={2}
              />
              <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined} className="self-start" data-testid="gift-submit">
                <Gift aria-hidden="true" className="size-4" />
                {pending ? tu("saving") : t("giftSubmit", { count: picked.length })}
              </Button>
            </form>
          ) : (
            <form key={`manual-${round}`} action={manualAction} noValidate className="flex flex-col gap-3" data-testid="manual-order-form">
              {manualError && !manualFieldError && <FormError message={t(`errors.${manualError}` as "errors.generic")} />}
              {packList}
              {transfers.length > 0 && (
                <SelectField
                  label={t("transfer")}
                  name="transferId"
                  value={transferId}
                  onValueChange={setTransferId}
                  hint={t("transferHint")}
                  options={[{ value: "", label: t("transferNone") }, ...transfers.map((x) => ({ value: x.id, label: x.label }))]}
                />
              )}
              <TextField
                label={t("amount")}
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                value={shownAmount}
                onChange={(e) => {
                  setAmountTouched(true);
                  setAmount(formatAmountInput(e.target.value, locale));
                }}
                hint={t("amountHint")}
                error={manualFieldError === "amountInvalid" || manualFieldError === "amountTooHigh" ? t(`errors.${manualFieldError}`) : undefined}
              />
              <TextArea
                label={t("note")}
                name="note"
                defaultValue={manual.status === "error" ? (manual.values?.note ?? "") : ""}
                hint={t("noteHint", { max: MANUAL_NOTE_MAX })}
                error={manualFieldError === "noteRequired" || manualFieldError === "noteTooLong" ? t(`errors.${manualFieldError}`, { max: MANUAL_NOTE_MAX }) : undefined}
                maxLength={MANUAL_NOTE_MAX}
                rows={2}
              />
              <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending || undefined} className="self-start" data-testid="manual-order-submit">
                <ReceiptText aria-hidden="true" className="size-4" />
                {pending ? t("saving") : t("submit")}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
