import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Link } from "@backend/i18n/navigation";
import { AUDIT_ACTIONS, auditActionKey, parseAuditFilters } from "@backend/lib/admin/audit-rules";
import { requireAdminPage } from "@backend/auth/admin-page";
import { listAuditAdmins, listAuditLog } from "@backend/modules/audit/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAudit");
  return { title: t("title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const control = "h-10 rounded-xl border border-bronze-600 bg-ink-900 px-3 text-sm text-ivory-100";

/**
 * The Admin action log (GĐ5.7, DECISIONS #36): who did what and when, newest first, 50 per page, filtered by
 * Admin, action and days (shop time). Read-only — nothing on this page edits or deletes a log row.
 */
export default async function AdminAuditPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  const t = await getTranslations("adminAudit");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("title")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("intro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <AuditList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuditList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const sp = await searchParams;
  const f = parseAuditFilters({
    admin: one(sp.admin),
    action: one(sp.action),
    from: one(sp.from),
    to: one(sp.to),
    page: one(sp.page),
  });
  const [list, admins, t, format] = await Promise.all([
    listAuditLog({ adminId: f.adminId, action: f.action, since: f.since, until: f.until }, f.page),
    listAuditAdmins(),
    getTranslations("adminAudit"),
    getFormatter(),
  ]);
  const filtered = !!(f.adminId || f.action || f.from || f.to);
  const query = {
    ...(f.adminId ? { admin: f.adminId } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
  };
  const pageHref = (p: number) => ({ pathname: "/admin/audit", query: { ...query, page: p } });

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2" data-testid="audit-filters">
        <div className="flex min-w-0 flex-col gap-1 text-xs text-ivory-500">
          <span aria-hidden="true">{t("filter.admin")}</span>
          <SelectMenu
            name="admin"
            defaultValue={f.adminId ?? ""}
            ariaLabel={t("filter.admin")}
            className="max-w-64"
            options={[{ value: "", label: t("filter.allAdmins") }, ...admins.map((a) => ({ value: a.id, label: a.email }))]}
            testId="filter-admin"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-xs text-ivory-500">
          <span aria-hidden="true">{t("filter.action")}</span>
          <SelectMenu
            name="action"
            defaultValue={f.action ?? ""}
            ariaLabel={t("filter.action")}
            className="max-w-64"
            options={[
              { value: "", label: t("filter.allActions") },
              ...AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`action.${auditActionKey(a)}`) })),
            ]}
            testId="filter-action"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-ivory-500">
          {t("filter.from")}
          <input type="date" name="from" defaultValue={f.from ?? ""} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ivory-500">
          {t("filter.to")}
          <input type="date" name="to" defaultValue={f.to ?? ""} className={control} />
        </label>
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          {t("filter.submit")}
        </Button>
        {filtered && (
          <Button asChild variant="ghost" size="sm" className="h-10">
            <Link href="/admin/audit">{t("filter.clear")}</Link>
          </Button>
        )}
      </form>

      <p className="text-xs text-ivory-500" data-testid="audit-count">
        {t("count", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <ul
          className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900"
          data-testid="audit-list"
        >
          {list.items.map((r) => {
            const target = r.label ?? r.entityId;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-1.5 px-4 py-3 sm:px-5"
                data-testid="audit-row"
                data-action={r.rawAction}
                data-entity-id={r.entityId}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium text-ivory-100">
                    {r.action ? t(`action.${auditActionKey(r.action)}`) : r.rawAction}
                  </span>
                  <time dateTime={r.createdAt.toISOString()} className="text-xs text-ivory-500 tabular-nums">
                    {format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "medium" })}
                  </time>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ivory-500">
                  <span className="break-all">{t("by", { email: r.adminEmail })}</span>
                  <span className="break-all">
                    {t(
                      `entity.${r.entity === "Product" || r.entity === "Order" || r.entity === "User" || r.entity === "Coupon" || r.entity === "ShopSettings" || r.entity === "UnmatchedTransfer" ? r.entity : "other"}`,
                    )}
                    {": "}
                    {r.href ? (
                      <Link href={r.href} className="text-gold-300 hover:underline" data-testid="audit-target">
                        {target}
                      </Link>
                    ) : (
                      <span className="text-ivory-300">{target}</span>
                    )}
                  </span>
                </div>
                {r.diff !== null && r.diff !== undefined && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-ivory-500 hover:text-ivory-300">{t("details")}</summary>
                    <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ivory-300">
                      {JSON.stringify(r.diff, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {list.pageCount > 1 && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label={t("page", { page: list.page, count: list.pageCount })}
        >
          {list.page > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref(list.page - 1)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                {t("prev")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-ivory-500 tabular-nums">
            {t("page", { page: list.page, count: list.pageCount })}
          </span>
          {list.page < list.pageCount ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={pageHref(list.page + 1)}>
                {t("next")}
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
