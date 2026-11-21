import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { ManualOrderPanel } from "@/components/admin/manual-order-panel";
import { RevokeGiftButton } from "@/components/admin/revoke-gift-button";
import { UserLockPanel } from "@/components/admin/user-lock-panel";
import { ProductThumb } from "@/components/product/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { listOpenTransfersForLinking } from "@backend/modules/order/admin-service";
import { getAdminUser } from "@backend/modules/user/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

/** Account ids are not known at build time: a placeholder param keeps the route buildable (.claude/rules/nextjs.md). */
export function generateStaticParams() {
  return [{ id: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminUsers");
  return { title: t("listTitle") };
}

const card = "flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5";

/**
 * One account for the Admin (GĐ5.5): orders, library (with gifts), lock / unlock; the "Manual order" box gives packs by
 * hand, as a gift or as a paid order for a customer who paid by a private transfer (user choice 2026-11-21).
 */
export default async function AdminUserPage({ params, searchParams }: PageProps<"/[locale]/admin/users/[id]">) {
  const t = await getTranslations("adminUsers");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/admin/users"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
        data-testid="admin-user-back"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <UserDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ivory-500">{label}</dt>
      <dd className="min-w-0 text-right break-all text-ivory-100 tabular-nums">{children}</dd>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Previous / next for one list of the page (5 per page, user request 2026-11-21). The other list keeps its page;
 * the page does not jump back to the top.
 */
function Pager({
  page,
  pageCount,
  href,
  labels,
  testId,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  labels: { prev: string; next: string; page: string };
  testId: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={labels.page} data-testid={testId}>
      {page > 1 ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(page - 1)} scroll={false}>
            <ChevronLeft aria-hidden="true" className="size-4" />
            {labels.prev}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-xs text-ivory-500 tabular-nums">{labels.page}</span>
      {page < pageCount ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={href(page + 1)} scroll={false}>
            {labels.next}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

async function UserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPage(); // before reading any data
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = raw as Locale;
  const [u, openTransfers, t, tr, tl, tlib, tc, tp, format] = await Promise.all([
    getAdminUser(id, admin.id, locale, { orders: one(query.orders), library: one(query.library) }),
    listOpenTransfersForLinking(),
    getTranslations("adminUsers"),
    getTranslations("checkout.result"),
    getTranslations("localeSwitcher"),
    getTranslations("library"),
    getTranslations("common"),
    getTranslations("product"),
    getFormatter(),
  ]);
  if (!u) redirect({ href: "/admin/users", locale });
  const user = u!;
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  // Each list keeps the other's page in the URL; page 1 is left out.
  const pageHref = (orders: number, library: number) => {
    const q = new URLSearchParams();
    if (orders > 1) q.set("orders", String(orders));
    if (library > 1) q.set("library", String(library));
    const s = q.toString();
    return `/admin/users/${user.id}${s ? `?${s}` : ""}`;
  };
  const pagerLabels = (p: { page: number; pageCount: number }) => ({
    prev: t("prev"),
    next: t("next"),
    page: t("page", { page: p.page, count: p.pageCount }),
  });

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold break-all text-ivory-100" data-testid="admin-user-email">
          {user.email}
        </h1>
        <span className="flex flex-wrap gap-1">
          {user.role === "ADMIN" && <Badge variant="premium">{t("role.ADMIN")}</Badge>}
          <Badge
            variant={user.status === "ACTIVE" ? "free" : "neutral"}
            data-testid="admin-user-status"
            data-status={user.status}
          >
            {t(`status.${user.status}`)}
          </Badge>
        </span>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={card} data-testid="admin-user-library">
            <header className="flex flex-col gap-0.5">
              <h2 className="font-sans text-base font-semibold text-ivory-100">
                {t("libraryTitleCount", { count: user.libraryCount })}
              </h2>
              <p className="text-xs text-pretty text-ivory-500">{t("libraryIntro")}</p>
            </header>
            {user.library.length === 0 ? (
              <p className="text-sm text-ivory-500">{t("libraryEmpty")}</p>
            ) : (
              <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
                {user.library.map((e) => (
                  <li
                    key={e.productId}
                    className="flex items-center gap-3 px-3.5 py-3"
                    data-testid="admin-user-pack"
                    data-slug={e.slug}
                    data-source={e.source}
                    data-revoked={e.revokedAt ? "true" : "false"}
                  >
                    <div className="w-14 shrink-0 overflow-hidden rounded-lg">
                      <ProductThumb
                        thumbnail={e.thumbnail}
                        alt=""
                        demoLabel={tc("demo")}
                        noImageLabel={tp("noImage")}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium text-pretty text-ivory-100">{e.title}</span>
                      <span className="text-xs text-ivory-500">
                        {t("since", { date: format.dateTime(e.grantedAt, { dateStyle: "medium" }) })}
                        {e.orderCode && (
                          <>
                            {" · "}
                            <Link href={`/admin/orders/${e.orderCode}`} className="text-gold-300 hover:underline">
                              {e.orderCode}
                            </Link>
                          </>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="neutral">{tlib(`source.${e.source}`)}</Badge>
                        {e.revokedAt && (
                          <Badge variant="neutral">
                            {t("revokedOn", { date: format.dateTime(e.revokedAt, { dateStyle: "medium" }) })}
                          </Badge>
                        )}
                      </span>
                    </div>
                    {e.source === "ADMIN_GRANT" && !e.revokedAt && (
                      <RevokeGiftButton userId={user.id} productId={e.productId} title={e.title} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={user.libraryPage.page}
              pageCount={user.libraryPage.pageCount}
              href={(p) => pageHref(user.ordersPage.page, p)}
              labels={pagerLabels(user.libraryPage)}
              testId="admin-user-library-pages"
            />
          </section>

          <section className={card} data-testid="admin-user-orders">
            <h2 className="font-sans text-base font-semibold text-ivory-100">
              {t("ordersTitle", { count: user.orderCount })}
            </h2>
            {user.orders.length === 0 ? (
              <p className="text-sm text-ivory-500">{t("ordersEmpty")}</p>
            ) : (
              <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
                {user.orders.map((o) => (
                  <li key={o.code}>
                    <Link
                      href={`/admin/orders/${o.code}`}
                      className="flex items-center gap-3 px-3.5 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-ivory-100/5"
                      data-testid="admin-user-order"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-sm font-medium text-ivory-100 tabular-nums">{o.code}</span>
                        <span className="text-xs text-ivory-500">
                          {when(o.createdAt)} · {t("itemCount", { count: o.itemCount })}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Badge variant={o.status === "PAID" ? "free" : "neutral"}>{tr(`status.${o.status}`)}</Badge>
                          {o.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-ivory-100 tabular-nums">
                        {formatVnd(o.totalVnd, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={user.ordersPage.page}
              pageCount={user.ordersPage.pageCount}
              href={(p) => pageHref(p, user.libraryPage.page)}
              labels={pagerLabels(user.ordersPage)}
              testId="admin-user-orders-pages"
            />
          </section>

          <section className={card} data-testid="admin-user-manual-order">
            <header className="flex flex-col gap-0.5">
              <h2 className="font-sans text-base font-semibold text-ivory-100">{t("manual.title")}</h2>
              <p className="text-xs text-pretty text-ivory-500">{t("manual.intro")}</p>
            </header>
            <ManualOrderPanel
              userId={user.id}
              packs={user.giftable.map((p) => ({ id: p.id, title: p.title, priceVnd: p.priceVnd }))}
              transfers={openTransfers.map((x) => ({
                id: x.id,
                amountVnd: x.amountVnd,
                label: `${formatVnd(x.amountVnd, locale)} · “${x.content.slice(0, 40)}” · ${format.dateTime(x.at, { dateStyle: "short", timeStyle: "short" })}${x.isDemo ? ` · ${t("manual.testTransfer")}` : ""}`,
              }))}
            />
          </section>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <section className={card} data-testid="admin-user-info">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("infoTitle")}</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label={t("name")}>{user.name ?? "—"}</Row>
              <Row label={t("roleLabel")}>{t(`role.${user.role}`)}</Row>
              <Row label={t("statusLabel")}>{t(`status.${user.status}`)}</Row>
              <Row label={t("language")}>{tl(user.preferredLocale as "vi")}</Row>
              <Row label={t("joinedLabel")}>{when(user.createdAt)}</Row>
              <Row label={t("downloads")}>{format.number(user.downloadCount)}</Row>
            </dl>
          </section>

          <section className={card} data-testid="admin-user-lock">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("lockTitleBox")}</h2>
            <UserLockPanel
              userId={user.id}
              status={user.status}
              blocked={
                user.lockBlock === "isAdmin" || user.lockBlock === "self" ? t(`lockBlocked.${user.lockBlock}`) : null
              }
            />
          </section>
        </div>
      </div>
    </>
  );
}
