import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { Link } from "@backend/i18n/navigation";
import { parseAdminUserFilters, USER_ROLES, USER_STATUSES } from "@backend/lib/admin/user-rules";
import { requireAdminPage } from "@backend/auth/admin-page";
import { listAdminUsers } from "@backend/modules/user/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminUsers");
  return { title: t("listTitle") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Admin account list (GĐ5.5): search by email / name, role + status filters (plain GET form), 20 per page. */
export default async function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  const t = await getTranslations("adminUsers");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("listTitle")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("listIntro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <UserList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UserList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage(); // layouts are not re-run on client navigation: check before reading any data
  const raw = await searchParams;
  const { q, role, status, page } = parseAdminUserFilters({
    q: one(raw.q),
    role: one(raw.role),
    status: one(raw.status),
    page: one(raw.page),
  });
  const [list, t, format] = await Promise.all([
    listAdminUsers({ q, role, status }, page),
    getTranslations("adminUsers"),
    getFormatter(),
  ]);
  const filtered = !!(q || role || status);
  const pageHref = (p: number) => ({
    pathname: "/admin/users",
    query: { ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}), page: p },
  });

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" data-testid="admin-user-filters">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">{t("search")}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ivory-500"
          />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-10 w-full rounded-xl border border-bronze-600 bg-ink-900 pr-3 pl-9 text-sm text-ivory-100 outline-hidden placeholder:text-ivory-500 focus:border-gold-500 focus:ring-2 focus:ring-gold-500/25"
          />
        </label>
        <SelectMenu
          name="role"
          defaultValue={role ?? ""}
          ariaLabel={t("roleLabel")}
          options={[{ value: "", label: t("roleAll") }, ...USER_ROLES.map((x) => ({ value: x, label: t(`role.${x}`) }))]}
          testId="filter-role"
        />
        <SelectMenu
          name="status"
          defaultValue={status ?? ""}
          ariaLabel={t("statusLabel")}
          options={[
            { value: "", label: t("statusAll") },
            ...USER_STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) })),
          ]}
          testId="filter-status"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10">
          {t("filter")}
        </Button>
      </form>

      <p className="text-xs text-ivory-500" data-testid="admin-user-count">
        {t("count", { count: list.total })}
      </p>

      {list.items.length === 0 ? (
        <p className="rounded-2xl border border-bronze-700 bg-ink-900 px-5 py-10 text-center text-sm text-ivory-500">
          {filtered ? t("emptyFiltered") : t("empty")}
        </p>
      ) : (
        <ul
          className="divide-y divide-bronze-700 rounded-2xl border border-bronze-700 bg-ink-900"
          data-testid="admin-user-list"
        >
          {list.items.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-ivory-100/5 sm:gap-4 sm:px-5"
                data-testid="admin-user-row"
                data-email={u.email}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium break-all text-ivory-100">{u.email}</span>
                  <span className="text-xs text-ivory-500">
                    {u.name ? `${u.name} · ` : ""}
                    {t("joined", { date: format.dateTime(u.createdAt, { dateStyle: "medium" }) })}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {u.role === "ADMIN" && <Badge variant="premium">{t("role.ADMIN")}</Badge>}
                    <Badge
                      variant={u.status === "ACTIVE" ? "free" : "neutral"}
                      data-testid="admin-user-status"
                      data-status={u.status}
                    >
                      {t(`status.${u.status}`)}
                    </Badge>
                  </span>
                </div>
                <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-ivory-500">{t("col.orders")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">{format.number(u.paidOrders)}</dd>
                  <dt className="text-ivory-500">{t("col.library")}</dt>
                  <dd className="text-right text-ivory-100 tabular-nums">{format.number(u.libraryCount)}</dd>
                </dl>
              </Link>
            </li>
          ))}
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
