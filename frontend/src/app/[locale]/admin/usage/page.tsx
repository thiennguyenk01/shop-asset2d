import { RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { UsageMeter } from "@/components/admin/usage-meter";
import type { Locale } from "@backend/i18n/routing";
import { formatBytes } from "@backend/lib/format";
import { Link } from "@backend/i18n/navigation";
import { FREE_LIMITS, FREE_LIMITS_CHECKED_ON, STORAGE_BLOCK_BYTES, type UsageKey } from "@backend/lib/usage/rules";
import { requireAdminPage } from "@backend/auth/admin-page";
import { refreshUsageAction } from "@backend/modules/usage/admin-actions";
import { freeTierOnly } from "@backend/modules/usage/guard";
import { getUsageReport, type UsageReport } from "@backend/modules/usage/service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminUsage");
  return { title: t("title") };
}

const card = "rounded-2xl border border-bronze-700 bg-ink-900";
const BYTES: readonly UsageKey[] = ["database", "storage"];

/**
 * Admin "Usage" (user choice 2026-11-22): how much of each free allowance this environment uses, so the shop can
 * stay on free plans. Only what the app can read itself (no provider tokens); allowances are written in the code
 * (backend/src/lib/usage/rules.ts).
 */
export default async function AdminUsagePage({ params }: PageProps<"/[locale]/admin/usage">) {
  const t = await getTranslations("adminUsage");
  return (
    <div className="flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("title")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("intro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="grid gap-3 md:grid-cols-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-40 animate-pulse ${card}`} />
            ))}
          </div>
        }
      >
        <Usage params={params} />
      </Suspense>
    </div>
  );
}

async function Usage({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminPage(); // before reading any data
  const locale = (await params).locale as Locale;
  const [r, t, format, freeOnly] = await Promise.all([getUsageReport(), getTranslations("adminUsage"), getFormatter(), freeTierOnly()]);
  const amount = (key: UsageKey, n: number) => (BYTES.includes(key) ? formatBytes(n, locale) : format.number(n));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ivory-500" data-testid="usage-measured-at">
          {t("measuredAt", { time: format.dateTime(r.measuredAt, { dateStyle: "medium", timeStyle: "short" }) })}
        </p>
        <form action={refreshUsageAction}>
          <button
            type="submit"
            data-testid="usage-refresh"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-gold-500/60 px-4 text-sm font-semibold text-gold-300 transition-colors hover:bg-gold-500/10 focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:outline-none"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {t("refresh")}
          </button>
        </form>
      </div>

      <p
        data-testid="usage-mode"
        data-on={freeOnly}
        className={`rounded-2xl border p-4 text-sm text-pretty ${freeOnly ? "border-jade-600/50 bg-jade-600/10 text-ivory-100" : "border-cinnabar-500/60 bg-cinnabar-600/10 text-ivory-100"}`}
      >
        {freeOnly ? t("modeOn", { storageStop: formatBytes(STORAGE_BLOCK_BYTES, locale) }) : t("modeOff")}{" "}
        <Link href="/admin/settings" className="font-semibold text-gold-300 underline-offset-4 hover:underline">
          {t("modeLink")}
        </Link>
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(FREE_LIMITS) as UsageKey[]).map((key) => {
          const it = r.items.find((i) => i.key === key);
          if (!it) {
            return (
              <section key={key} data-testid={`usage-${key}`} data-level="unknown" className={`flex flex-col gap-2 p-5 ${card}`}>
                <h2 className="font-sans text-base font-semibold text-ivory-100">{t(`items.${key}`)}</h2>
                <p className="text-sm text-pretty text-cinnabar-500">{t("failed")}</p>
              </section>
            );
          }
          return (
            <UsageMeter
              key={key}
              testId={`usage-${key}`}
              title={t(`items.${key}`)}
              amount={t("amount", { used: amount(key, it.used), limit: amount(key, it.limit) })}
              percent={it.percent}
              level={it.level}
              levelLabel={t(`levels.${it.level}`)}
            >
              <ItemNotes item={key} report={r} locale={locale} />
            </UsageMeter>
          );
        })}
      </div>

      {r.tables.length > 0 && (
        <section className={`flex flex-col gap-3 p-5 ${card}`} data-testid="usage-tables">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("tablesTitle")}</h2>
            <p className="text-xs text-ivory-500">{t("tablesIntro")}</p>
          </div>
          <ul className="flex flex-col divide-y divide-bronze-700 text-sm">
            {r.tables.map((tb) => (
              <li key={tb.name} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="font-mono text-ivory-300">{tb.name}</span>
                <span className="text-ivory-500 tabular-nums">{formatBytes(tb.bytes, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`flex flex-col gap-2 p-5 text-sm text-pretty text-ivory-500 ${card}`}>
        <h2 className="font-sans text-base font-semibold text-ivory-100">{t("notMeasuredTitle")}</h2>
        <p>{t("notMeasured")}</p>
        <p>
          {t("limitsNote", { date: format.dateTime(new Date(`${FREE_LIMITS_CHECKED_ON}T00:00:00Z`), { dateStyle: "long" }) })}{" "}
          {(["database", "storage", "emailDay"] as const).map((key, i) => (
            <span key={key}>
              {i > 0 && " · "}
              <a href={FREE_LIMITS[key].source} target="_blank" rel="noreferrer" className="text-ivory-300 underline underline-offset-4 hover:text-ivory-100">
                {t(`providers.${key}`)}
              </a>
            </span>
          ))}
        </p>
      </section>
    </>
  );
}

async function ItemNotes({ item, report: r, locale }: { item: UsageKey; report: UsageReport; locale: Locale }) {
  const t = await getTranslations("adminUsage");
  if (item === "database") return <p>{t("notes.database")}</p>;
  if (item === "storage") {
    const b = (k: "public" | "private") => ({ bytes: formatBytes(r.buckets[k]?.bytes ?? 0, locale), count: r.buckets[k]?.objects ?? 0 });
    return (
      <>
        <p>{t("notes.buckets", { publicBytes: b("public").bytes, publicCount: b("public").count, privateBytes: b("private").bytes, privateCount: b("private").count })}</p>
        <p>{r.storageDriver === "r2" ? t("notes.storage") : t("notes.storageLocal")}</p>
      </>
    );
  }
  return (
    <>
      <p>{t("notes.email")}</p>
      {r.mailDriver !== "resend" && <p>{t("notes.emailNotSent", { driver: r.mailDriver })}</p>}
    </>
  );
}
