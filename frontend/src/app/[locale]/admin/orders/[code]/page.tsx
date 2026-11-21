import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { RefundPanel } from "@/components/admin/refund-panel";
import { ProductThumb } from "@/components/product/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getAdminOrder } from "@backend/modules/order/admin-service";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

/** Order codes are not known at build time: a placeholder param keeps the route buildable (.claude/rules/nextjs.md). */
export function generateStaticParams() {
  return [{ code: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOrders");
  return { title: t("listTitle") };
}

const card = "flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5";

/** One order for the Admin (GĐ5.4): lines and access, totals, payment history, refunds, the refund action. */
export default async function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[code]">) {
  const t = await getTranslations("adminOrders");
  return (
    <div className="flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
        data-testid="admin-order-back"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <OrderDetail params={params} />
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

async function OrderDetail({ params }: { params: Promise<{ locale: string; code: string }> }) {
  await requireAdminPage(); // before reading any data
  const { locale: raw, code } = await params;
  const locale = raw as Locale;
  const [o, t, tr, tc, tp, tl, format] = await Promise.all([
    getAdminOrder(code, locale),
    getTranslations("adminOrders"),
    getTranslations("checkout.result"),
    getTranslations("common"),
    getTranslations("product"),
    getTranslations("localeSwitcher"),
    getFormatter(),
  ]);
  if (!o) redirect({ href: "/admin/orders", locale });
  const order = o!;
  const vnd = (n: number) => formatVnd(n, locale);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ivory-100 tabular-nums" data-testid="admin-order-code">
          {order.code}
        </h1>
        <span className="flex flex-wrap gap-1">
          <Badge
            variant={order.status === "PAID" ? "free" : "neutral"}
            data-testid="admin-order-status"
            data-status={order.status}
          >
            {tr(`status.${order.status}`)}
          </Badge>
          {order.isDemo && <Badge variant="demo">{tr("demoBadge")}</Badge>}
        </span>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={card} data-testid="admin-order-items">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("itemsTitle")}</h2>
            <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
              {order.items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 px-3.5 py-3" data-testid="admin-order-item">
                  <div className="w-16 shrink-0 overflow-hidden rounded-lg">
                    <ProductThumb thumbnail={i.thumbnail} alt="" demoLabel={tc("demo")} noImageLabel={tp("noImage")} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium text-pretty text-ivory-100">
                      {i.extraDownloads ? t("extraLine", { title: i.title, count: i.extraDownloads }) : i.title}
                    </span>
                    <span className="text-xs break-all text-ivory-500">
                      {i.slug}
                      {i.version && ` · ${t("version", { version: i.version })}`}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Badge variant={i.productType === "FREE" ? "free" : "premium"}>
                        {tc(i.productType === "FREE" ? "free" : "premium")}
                      </Badge>
                      {i.access && (
                        <Badge
                          variant={i.access === "active" ? "free" : "neutral"}
                          data-testid="admin-order-access"
                          data-access={i.access}
                        >
                          {t(`access.${i.access}`)}
                        </Badge>
                      )}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-ivory-100 tabular-nums">{vnd(i.priceVnd)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label={tr("subtotal")}>{vnd(order.subtotalVnd)}</Row>
              {order.discountVnd > 0 && (
                <Row label={tr("discount", { code: order.couponCode ?? "—" })}>−{vnd(order.discountVnd)}</Row>
              )}
              <Row label={tr("total")}>
                <span className="font-semibold" data-testid="admin-order-total">
                  {vnd(order.totalVnd)}
                </span>
              </Row>
            </dl>
          </section>

          <section className={card} data-testid="admin-order-payments">
            <header className="flex flex-col gap-0.5">
              <h2 className="font-sans text-base font-semibold text-ivory-100">{t("paymentsTitle")}</h2>
              <p className="text-xs text-pretty text-ivory-500">{t("paymentsIntro")}</p>
            </header>
            {order.payments.length === 0 ? (
              <p className="text-sm text-ivory-500">{t("paymentsEmpty")}</p>
            ) : (
              <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
                {order.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-1 px-3.5 py-3 text-sm"
                    data-testid="admin-order-payment"
                    data-status={p.status}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ivory-100">
                        {t(`provider.${p.provider}` as "provider.DEMO")}
                      </span>
                      <Badge variant={p.status === "SUCCEEDED" ? "free" : "neutral"}>
                        {t(`paymentStatus.${p.status}` as "paymentStatus.PENDING")}
                      </Badge>
                      <span className="ml-auto font-medium text-ivory-100 tabular-nums">{vnd(p.amountVnd)}</span>
                    </div>
                    <span className="text-xs break-all text-ivory-500">
                      {t("txn", { id: p.providerTxnId ?? "—" })} · {t("paymentCreated", { time: when(p.createdAt) })}
                      {p.status !== "PENDING" && ` · ${t("paymentUpdated", { time: when(p.updatedAt) })}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {order.refunds.length > 0 && (
            <section className={card} data-testid="admin-order-refunds">
              <h2 className="font-sans text-base font-semibold text-ivory-100">{t("refundsTitle")}</h2>
              <ul className="divide-y divide-bronze-700 rounded-xl border border-bronze-700">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-3.5 py-3 text-sm" data-testid="admin-order-refund">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{t(`refundStatus.${r.status}` as "refundStatus.COMPLETED")}</Badge>
                      <span className="text-xs text-ivory-500">{when(r.createdAt)}</span>
                      <span className="ml-auto font-medium text-ivory-100 tabular-nums">{vnd(r.amountVnd)}</span>
                    </div>
                    <p
                      className="text-pretty wrap-break-word whitespace-pre-line text-ivory-300"
                      data-testid="admin-order-refund-reason"
                    >
                      {r.reason}
                    </p>
                    <span className="text-xs break-all text-ivory-500">
                      {t("refundBy", { admin: r.adminName ? `${r.adminName} (${r.adminEmail})` : r.adminEmail })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <section className={card} data-testid="admin-order-buyer">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{tr("buyer")}</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label={t("buyerName")}>{order.buyerName}</Row>
              <Row label={t("buyerEmail")}>{order.buyerEmail}</Row>
              {order.account.email !== order.buyerEmail && <Row label={t("accountEmail")}>{order.account.email}</Row>}
              <Row label={t("accountStatus")}>{t(`account.${order.account.status}` as "account.ACTIVE")}</Row>
              <Row label={t("language")}>{tl(order.locale as "vi")}</Row>
            </dl>
            <Link
              href={`/admin/users/${order.account.id}`}
              className="text-sm text-gold-300 hover:underline"
              data-testid="admin-order-account-link"
            >
              {t("openAccount")}
            </Link>
          </section>

          <section className={card} data-testid="admin-order-times">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("timesTitle")}</h2>
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label={t("createdAt")}>{when(order.createdAt)}</Row>
              {order.paidAt && <Row label={t("paidAt")}>{when(order.paidAt)}</Row>}
              {order.status === "PENDING" && order.expiresAt && (
                <Row label={t("expiresAt")}>{when(order.expiresAt)}</Row>
              )}
            </dl>
          </section>

          <section className={card} data-testid="admin-order-refund-box">
            <h2 className="font-sans text-base font-semibold text-ivory-100">{t("refundBoxTitle")}</h2>
            {/* Always mounted, so its success toast survives the refresh that replaces the button. */}
            <RefundPanel
              code={order.code}
              amount={vnd(order.totalVnd)}
              isDemo={order.isDemo}
              blocked={
                order.refundBlock === null
                  ? null
                  : order.status === "REFUNDED"
                    ? { reason: "refunded", text: t("alreadyRefunded") }
                    : { reason: order.refundBlock, text: t(`blocked.${order.refundBlock}`) }
              }
            />
          </section>
        </div>
      </div>
    </>
  );
}
