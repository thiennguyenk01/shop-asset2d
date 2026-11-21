import { Landmark } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/checkout/checkout-client";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import type { BankTransferView } from "@backend/modules/order/service";

/**
 * SePay transfer details for a PENDING order (user choice 2026-11-20): VietQR image + bank, account, exact amount
 * and the memo to write. The order settles only when SePay's signed notification of that transfer arrives —
 * this box never changes anything. Test mode: no money may move, so the QR is blurred and the buyer is told to
 * simulate the transfer on my.sepay.vn instead.
 */
export async function BankTransferBox({ transfer, expiresAt, locale }: { transfer: BankTransferView; expiresAt: Date | null; locale: Locale }) {
  const [t, format] = await Promise.all([getTranslations("checkout.sepay"), getFormatter()]);
  const amount = formatVnd(transfer.amountVnd, locale);
  const rows = [
    { label: t("bank"), value: transfer.bankName, copy: null },
    { label: t("account"), value: transfer.account, copy: transfer.account },
    ...(transfer.accountName ? [{ label: t("accountName"), value: transfer.accountName, copy: null }] : []),
    { label: t("amount"), value: amount, copy: String(transfer.amountVnd) },
  ];
  return (
    <section aria-labelledby="transfer-title" className="flex flex-col gap-4 rounded-2xl border border-gold-500/50 bg-ink-900 p-5" data-testid="bank-transfer">
      <header className="flex items-start gap-3">
        <Landmark aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold-300" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="transfer-title" className="font-sans text-base font-semibold text-ivory-100">
            {t("title")}
          </h2>
          <p className="text-sm text-pretty text-ivory-300">{transfer.testMode ? t("introTest") : t("intro")}</p>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
        <figure className="relative mx-auto w-48 overflow-hidden rounded-xl bg-paper p-2 sm:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- VietQR image from SePay's QR service; a QR must not be resized or re-encoded */}
          <img
            src={transfer.qrUrl}
            alt={transfer.testMode ? "" : t("qrAlt", { amount, memo: transfer.memo })}
            width={176}
            height={176}
            referrerPolicy="no-referrer"
            className={transfer.testMode ? "size-44 blur-sm" : "size-44"}
          />
          {transfer.testMode && (
            <figcaption className="absolute inset-0 flex items-center justify-center bg-soot/60 p-3 text-center text-xs font-semibold text-paper">
              {t("qrTestCover")}
            </figcaption>
          )}
        </figure>

        <dl className="flex flex-col divide-y divide-bronze-700 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <div className="grid min-w-0 gap-0.5">
                <dt className="text-xs text-ivory-500">{row.label}</dt>
                <dd className="font-medium text-ivory-100 tabular-nums [overflow-wrap:anywhere]">{row.value}</dd>
              </div>
              {row.copy && <CopyButton value={row.copy} label={row.label} />}
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="grid min-w-0 gap-0.5">
              <dt className="text-xs text-ivory-500">{t("memo")}</dt>
              <dd className="text-lg font-semibold tracking-wide text-gold-300 tabular-nums" data-testid="transfer-memo">
                {transfer.memo}
              </dd>
            </div>
            <CopyButton value={transfer.memo} label={t("memo")} />
          </div>
        </dl>
      </div>

      <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-pretty text-ivory-300">
        <li>{t("ruleMemo")}</li>
        <li>{t("ruleAmount")}</li>
        {expiresAt && <li>{t("ruleTime", { time: format.dateTime(expiresAt, { timeStyle: "short" }) })}</li>}
      </ul>
    </section>
  );
}
