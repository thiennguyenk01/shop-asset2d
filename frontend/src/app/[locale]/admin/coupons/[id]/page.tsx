import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { CouponForm } from "@/components/admin/coupon-form";
import { DeleteCouponButton } from "@/components/admin/delete-coupon-button";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { toShopDateTimeInput } from "@backend/lib/admin/coupon-rules";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { updateCouponAction } from "@backend/modules/coupon/admin-actions";
import { getAdminCoupon } from "@backend/modules/coupon/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

/** Coupon ids are not known at build time: a placeholder param keeps the route buildable (.claude/rules/nextjs.md). */
export function generateStaticParams() {
  return [{ id: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminCoupons");
  return { title: t("listTitle") };
}

const card = "flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5";

/** One coupon for the Admin (GĐ5.6, DECISIONS #35): edit (locked once used), use history, delete if unused. */
export default async function AdminCouponPage({ params }: PageProps<"/[locale]/admin/coupons/[id]">) {
  const t = await getTranslations("adminCoupons");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
        data-testid="coupon-back"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <CouponDetail params={params} />
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

async function CouponDetail({ params }: { params: Promise<{ locale: string; id: string }> }) {
  await requireAdminPage(); // before reading any data
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  const [c, t, tr, tc, format] = await Promise.all([
    getAdminCoupon(id),
    getTranslations("adminCoupons"),
    getTranslations("checkout.result"),
    getTranslations("common"),
    getFormatter(),
  ]);
  if (!c) redirect({ href: "/admin/coupons", locale });
  const coupon = c!;
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const num = (n: number | null) => (n === null ? "" : String(n));

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-wide break-all text-ivory-100" data-testid="coupon-code">
          {coupon.code}
        </h1>
        <span className="flex flex-wrap gap-1">
          <Badge
            variant={coupon.state === "active" ? "free" : "neutral"}
            data-testid="coupon-state"
            data-state={coupon.state}
          >
            {t(`state.${coupon.state}`)}
          </Badge>
          {coupon.used && (
            <Badge variant="neutral" data-testid="coupon-locked">
              {t("lockedBadge")}
            </Badge>
          )}
          {coupon.code.startsWith("DEMO") && <Badge variant="demo">{tc("demo")}</Badge>}
        </span>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <CouponForm
            mode="edit"
            action={updateCouponAction.bind(null, coupon.id)}
            locked={coupon.used}
            initial={{
              code: coupon.code,
              kind: coupon.kind,
              value: String(coupon.value),
              minTotalVnd: coupon.minTotalVnd ? String(coupon.minTotalVnd) : "",
              startsAt: toShopDateTimeInput(coupon.startsAt),
              endsAt: toShopDateTimeInput(coupon.endsAt),
              maxUses: num(coupon.maxUses),
              maxUsesPerUser: num(coupon.maxUsesPerUser),
              isActive: coupon.isActive,
            }}
          />

          <section className={card} data-testid="coupon-orders">
            <header className="flex flex-col gap-0.5">
              <h2 className="font-sans text-base font-semibold text-ivory-100">
                {t("ordersTitle", { count: coupon.orderCount })}
              </h2>
              <p className="text-xs text-pretty text-ivory-500">{t("ordersIntro")}</p>
            </header>
            {coupon.orders.length === 0 ? (
              <p className="text-sm text-ivory-500">{t("ordersEmpty")}</p>
            ) : (
              <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
                {coupon.orders.map((o) => (
                  <li key={o.code}>
                    <Link
                      href={`/admin/orders/${o.code}`}
                      className="flex items-center gap-3 px-3.5 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-ivory-100/5"
                      data-testid="coupon-order"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-sm font-medium text-ivory-100 tabular-nums">{o.code}</span>
                        <span className="text-xs break-all text-ivory-500">
                          {when(o.createdAt)} · {o.userEmail}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          <Badge variant={o.status === "PAID" ? "free" : "neutral"}>{tr(`status.${o.status}`)}</Badge>
                          {o.isDemo && <Badge variant="demo">{tc("demo")}</Badge>}
                        </span>
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm tabular-nums">
                        <span className="font-medium text-ivory-100">{formatVnd(o.totalVnd, locale)}</span>
                        <span className="text-xs text-ivory-500">−{formatVnd(o.discountVnd, locale)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <section className={card} data-testid="coupon-info">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("infoTitle")}</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label={t("col.used")}>
                {coupon.maxUses === null
                  ? format.number(coupon.usedCount)
                  : `${format.number(coupon.usedCount)} / ${format.number(coupon.maxUses)}`}
              </Row>
              <Row label={t("col.perUser")}>
                {coupon.maxUsesPerUser === null ? t("noLimit") : format.number(coupon.maxUsesPerUser)}
              </Row>
              <Row label={t("createdAt")}>{when(coupon.createdAt)}</Row>
              <Row label={t("updatedAt")}>{when(coupon.updatedAt)}</Row>
            </dl>
          </section>

          <section className={card} data-testid="coupon-delete-box">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("deleteBox")}</h2>
            {coupon.used ? (
              <p className="text-sm text-pretty text-ivory-500" data-testid="coupon-delete-blocked">
                {t("deleteBlocked")}
              </p>
            ) : (
              <>
                <p className="text-sm text-pretty text-ivory-500">{t("deleteHint")}</p>
                <DeleteCouponButton id={coupon.id} code={coupon.code} />
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
