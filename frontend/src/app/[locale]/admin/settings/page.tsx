import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { FormCard } from "@/components/admin/fields";
import { SettingsForm } from "@/components/admin/settings-form";
import type { Locale } from "@backend/i18n/routing";
import type { ExtraDownloadsSettings } from "@backend/lib/admin/settings-rules";
import { FREE_DOWNLOADS_PER_PACK } from "@backend/lib/download/rules";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getAdminSettings } from "@backend/modules/settings/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminSettings");
  return { title: t("title") };
}

/** Admin Settings (GĐ5.6, DECISIONS #35): the "buy more downloads" offer for free packs, with its change log. */
export default async function AdminSettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const t = await getTranslations("adminSettings");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("title")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("intro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="h-72 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <Settings params={params} />
      </Suspense>
    </div>
  );
}

async function Settings({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminPage(); // before reading any data
  const { locale: raw } = await params;
  const locale = raw as Locale;
  const [s, t, format] = await Promise.all([getAdminSettings(), getTranslations("adminSettings"), getFormatter()]);
  const offer = (o: ExtraDownloadsSettings | null) =>
    o ? t("offerText", { count: o.count, price: formatVnd(o.priceVnd, locale) }) : "—";

  return (
    <>
      <FormCard
        title={t("extraTitle")}
        intro={t("extraIntro", {
          free: FREE_DOWNLOADS_PER_PACK,
          defaultOffer: offer(s.defaults),
        })}
      >
        <p className="text-sm text-ivory-300" data-testid="settings-current">
          {t("current", { offer: offer(s.extraDownloads) })}
        </p>
        <SettingsForm initial={s.extraDownloads} />
      </FormCard>

      <section
        className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5"
        data-testid="settings-history"
      >
        <h2 className="font-sans text-base font-semibold text-ivory-100">{t("historyTitle")}</h2>
        {s.history.length === 0 ? (
          <p className="text-sm text-ivory-500">{t("historyEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-bronze-700 text-sm">
            {s.history.map((h, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0" data-testid="settings-change">
                <span className="text-ivory-100">
                  {offer(h.before)} → {offer(h.after)}
                </span>
                <span className="text-xs break-all text-ivory-500">
                  {format.dateTime(h.at, { dateStyle: "medium", timeStyle: "short" })} · {h.adminEmail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
