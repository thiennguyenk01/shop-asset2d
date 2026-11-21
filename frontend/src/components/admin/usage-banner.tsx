import { CircleAlert, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@backend/i18n/navigation";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getUsageReport } from "@backend/modules/usage/service";
import { cn } from "@/lib/cn";

/** Admin overview: shown only when an allowance is at 80 % or more (red from 95 %), with a link to "Usage". */
export async function UsageBanner() {
  await requireAdminPage(); // before reading any data
  const [r, t] = await Promise.all([getUsageReport(), getTranslations("adminUsage")]);
  if (r.worst === "ok") return null;
  const critical = r.worst === "critical";
  const names = r.items.filter((i) => i.level !== "ok").map((i) => `${t(`items.${i.key}`)} ${i.percent}%`);
  const Icon = critical ? CircleAlert : TriangleAlert;
  return (
    <div
      role="status"
      data-testid="usage-banner"
      data-level={r.worst}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-2xl border p-4",
        critical ? "border-cinnabar-500/60 bg-cinnabar-600/10" : "border-gold-500/50 bg-gold-500/10",
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", critical ? "text-cinnabar-500" : "text-gold-300")} />
      <p className="min-w-0 flex-1 text-sm text-pretty text-ivory-100">{t(critical ? "bannerCritical" : "bannerWarn", { items: names.join(" · ") })}</p>
      <Link href="/admin/usage" className="text-sm font-semibold text-gold-300 underline-offset-4 hover:underline">
        {t("bannerLink")}
      </Link>
    </div>
  );
}
