import { Download, Library, ShoppingBag, ShoppingCart } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BankTransferBox } from "@/components/checkout/bank-transfer";
import { CancelOrderButton, OrderStatusPoller } from "@/components/checkout/checkout-client";
import { DemoBanner } from "@/components/checkout/demo-banner";
import { ProductThumb } from "@/components/product/product-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Spinner, SuccessState } from "@/components/ui/states";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { getOrderForUser, type OrderView } from "@backend/modules/order/service";

/**
 * One order as its owner sees it: live status (re-rendered every few seconds while PENDING — it never grants
 * anything, only the verified webhook does) + the order's lines and totals. Used by the payment result page and
 * by the order history detail page. `returnPath` = where to come back after signing in.
 */
export async function OrderPanel({ code, locale, returnPath }: { code: string; locale: Locale; returnPath: string }) {
  const user = await getCurrentUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: returnPath } }, locale });
  const [t, tc, tcart] = await Promise.all([getTranslations("checkout"), getTranslations("common"), getTranslations("cart")]);
  const order = await getOrderForUser(code, user!.id, locale);

  if (!order) {
    return (
      <ErrorState
        title={t("result.notFoundTitle")}
        description={t("result.notFoundText")}
        action={
          <Button asChild variant="secondary">
            <Link href="/shop">{tcart("continueShopping")}</Link>
          </Button>
        }
      />
    );
  }

  const pending = order.status === "PENDING";
  const provider = order.payment?.provider;
  const banner = provider === "MOMO" ? "momo." : provider === "SEPAY" ? "sepay." : null;
  return (
    <>
      {/* A bank transfer can take minutes: poll more slowly, for the whole 30 minutes the order waits. */}
      {order.bankTransfer ? <OrderStatusPoller active={pending} intervalMs={4000} maxPolls={450} /> : <OrderStatusPoller active={pending} />}
      {order.isDemo &&
        (banner ? (
          <DemoBanner title={t(`${banner}testBanner` as "momo.testBanner")} text={t(`${banner}testBannerText` as "momo.testBannerText")} />
        ) : (
          <DemoBanner title={t("demoBanner")} text={t("demoBannerText")} />
        ))}
      {pending && order.bankTransfer && order.payment?.status === "PENDING" && (
        <BankTransferBox transfer={order.bankTransfer} expiresAt={order.expiresAt} locale={locale} />
      )}
      <StatusBlock order={order} />
      <OrderDetails order={order} locale={locale} labels={{ demo: tc("demo") }} />
    </>
  );
}

async function StatusBlock({ order }: { order: OrderView }) {
  const [t, tcart, tc] = await Promise.all([getTranslations("checkout.result"), getTranslations("cart"), getTranslations("checkout.cancel")]);
  if (order.extraDownloadsOnly && order.status !== "PENDING") return <ExtraDownloadsStatus order={order} />;
  const toCart = (
    <Button asChild variant="secondary">
      <Link href="/cart">
        <ShoppingCart aria-hidden="true" className="size-4" />
        {t("backToCart")}
      </Link>
    </Button>
  );
  const blocks: Record<OrderView["status"], ReactNode> = {
    PENDING: (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gold-500/50 px-6 py-10 text-center" data-testid="order-pending">
        <Spinner label={order.bankTransfer ? t("transferPendingTitle") : t("pendingTitle")} className="font-heading text-lg text-ivory-100" />
        <p className="max-w-md text-sm text-pretty text-ivory-300">{order.bankTransfer ? t("transferPendingText") : t("pendingText")}</p>
        {order.payment?.provider === "DEMO" && order.payment.status === "PENDING" && order.payment.providerTxnId && (
          <Button asChild>
            <Link href={`/checkout/demo/${order.payment.providerTxnId}`}>{t("continuePayment")}</Link>
          </Button>
        )}
        {/* MoMo: back to MoMo's own payment page saved when the payment started (an https page of momo.vn). */}
        {order.payment?.provider === "MOMO" && order.payment.status === "PENDING" && order.payment.resumeUrl && (
          <Button asChild>
            <a href={order.payment.resumeUrl} rel="noopener noreferrer" data-testid="continue-momo">
              {t("continuePayment")}
            </a>
          </Button>
        )}
        {/* The buyer may cancel it (user choice 2026-11-26); not MoMo, whose own page would still take the money. */}
        {order.payment?.provider !== "MOMO" && (
          <CancelOrderButton orderCode={order.code} label={tc("button")} variant="ghost" className="mt-1 w-auto" />
        )}
      </div>
    ),
    PAID: (
      <SuccessState
        title={t("paidTitle")}
        description={order.isDemo ? t("paidDemoText") : t("paidText")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="jade">
              <Link href="/library" data-testid="open-library">
                <Library aria-hidden="true" className="size-4" />
                {t("openLibrary")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/shop">
                <ShoppingBag aria-hidden="true" className="size-4" />
                {t("continueShopping")}
              </Link>
            </Button>
          </div>
        }
      />
    ),
    FAILED: <ErrorState title={t("failedTitle")} description={t("failedText")} action={toCart} />,
    CANCELLED: <ErrorState title={t("cancelledTitle")} description={t("cancelledText")} action={toCart} />,
    // A SePay transfer that arrives late still settles the order (user choice 2026-11-20): say so.
    EXPIRED: (
      <ErrorState
        title={t("expiredTitle")}
        description={order.payment?.provider === "SEPAY" && order.payment.status === "PENDING" ? t("expiredTransferText") : t("expiredText")}
        action={toCart}
      />
    ),
    REFUNDED: (
      <ErrorState
        title={t("refundedTitle")}
        description={t("refundedText")}
        action={
          <Button asChild variant="secondary">
            <Link href="/shop">{tcart("continueShopping")}</Link>
          </Button>
        }
      />
    ),
  };
  return <div data-testid="order-status" data-status={order.status}>{blocks[order.status]}</div>;
}

/** Result of a "more downloads" order (step 4.6): talks about downloads, offers to download right away. */
async function ExtraDownloadsStatus({ order }: { order: OrderView }) {
  const [t, te] = await Promise.all([getTranslations("checkout.result"), getTranslations("extraDownloads")]);
  const line = order.items[0];
  const toLibrary = (
    <Button asChild variant="secondary">
      <Link href="/library">
        <Library aria-hidden="true" className="size-4" />
        {t("openLibrary")}
      </Link>
    </Button>
  );
  const block =
    order.status === "PAID" ? (
      <SuccessState
        title={te("paidTitle", { count: line.extraDownloads ?? 0 })}
        description={te(order.isDemo ? "paidDemoText" : "paidText", { count: line.extraDownloads ?? 0, title: line.title })}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {/* ?download=1: the pack page starts the download once (same flag as after signing in). */}
            <Button asChild variant="jade">
              <Link href={`/product/${line.slug}?download=1`} data-testid="download-now">
                <Download aria-hidden="true" className="size-4" />
                {te("downloadNow")}
              </Link>
            </Button>
            {toLibrary}
          </div>
        }
      />
    ) : order.status === "REFUNDED" ? (
      <ErrorState title={t("refundedTitle")} description={te("refundedText")} action={toLibrary} />
    ) : (
      <ErrorState
        title={order.status === "EXPIRED" ? t("expiredTitle") : t("failedTitle")}
        description={te("failedText")}
        action={toLibrary}
      />
    );
  return (
    <div data-testid="order-status" data-status={order.status}>
      {block}
    </div>
  );
}

async function OrderDetails({ order, locale, labels }: { order: OrderView; locale: Locale; labels: { demo: string } }) {
  const [t, tp, te, format] = await Promise.all([getTranslations("checkout.result"), getTranslations("product"), getTranslations("extraDownloads"), getFormatter()]);
  const time = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-labelledby="order-title" className="rounded-2xl border border-bronze-700 bg-ink-900">
      <header className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="order-title" className="font-sans text-base font-semibold text-ivory-100 tabular-nums" data-testid="order-code">
            {t("orderTitle", { code: order.code })}
          </h2>
          <p className="text-xs text-ivory-500">
            {t("placedAt", { time: time(order.createdAt) })}
            {order.paidAt && ` · ${t("paidAt", { time: time(order.paidAt) })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {order.isDemo && <Badge variant="demo">{t("demoBadge")}</Badge>}
          <Badge variant={order.status === "PAID" ? "free" : "neutral"}>{t(`status.${order.status}`)}</Badge>
        </div>
      </header>
      <ul className="divide-y divide-bronze-700 border-t border-bronze-700">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-3 px-5 py-3">
            <div className="w-16 shrink-0 overflow-hidden rounded-lg">
              <ProductThumb thumbnail={item.thumbnail} alt="" demoLabel={labels.demo} noImageLabel={tp("noImage")} />
            </div>
            <Link href={`/product/${item.slug}`} className="min-w-0 flex-1 text-sm font-medium text-pretty text-ivory-100 hover:text-gold-300">
              {item.extraDownloads ? te("line", { title: item.title, count: item.extraDownloads }) : item.title}
            </Link>
            <span className="shrink-0 text-sm text-ivory-100 tabular-nums">{formatVnd(item.priceVnd, locale)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-2 border-t border-bronze-700 p-5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ivory-300">{t("subtotal")}</dt>
          <dd className="text-ivory-100 tabular-nums">{formatVnd(order.subtotalVnd, locale)}</dd>
        </div>
        {order.discountVnd > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-ivory-300">{t("discount", { code: order.couponCode ?? "" })}</dt>
            <dd className="text-jade-400 tabular-nums">−{formatVnd(order.discountVnd, locale)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-bronze-700 pt-3">
          <dt className="font-medium text-ivory-100">{t("total")}</dt>
          <dd className="text-lg font-semibold text-gold-300 tabular-nums" data-testid="order-total">
            {formatVnd(order.totalVnd, locale)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 pt-1 text-xs">
          <dt className="text-ivory-500">{t("buyer")}</dt>
          <dd className="text-ivory-300 [overflow-wrap:anywhere]">{order.buyerEmail}</dd>
        </div>
      </dl>
    </section>
  );
}
