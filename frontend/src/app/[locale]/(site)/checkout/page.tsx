import { CircleDot, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PlaceOrderForm } from "@/components/checkout/checkout-client";
import { DemoBanner } from "@/components/checkout/demo-banner";
import { BenefitList } from "@/components/product/benefit-list";
import { ProductThumb } from "@/components/product/product-thumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { packBenefits } from "@backend/lib/catalog/benefits";
import { formatVnd } from "@backend/lib/format";
import { gatewayLimits } from "@backend/lib/payment/limits";
import { getCurrentUser } from "@backend/auth/current-user";
import { readCouponCode } from "@backend/modules/cart/session";
import { placeOrderAction } from "@backend/modules/order/actions";
import { getCheckout } from "@backend/modules/order/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("checkout"), robots: { index: false } };
}

/** Name / description / note of the payment method, per active gateway (PayOS / VNPay are not built: Demo text). */
const methodKeys = {
  DEMO: { name: "methodDemo", text: "methodDemoText", note: "methodNote" },
  PAYOS: { name: "methodDemo", text: "methodDemoText", note: "methodNote" },
  VNPAY: { name: "methodDemo", text: "methodDemoText", note: "methodNote" },
  MOMO: { name: "momo.method", text: "momo.methodText", note: "momo.methodNote" },
  SEPAY: { name: "sepay.method", text: "sepay.methodText", note: "sepay.methodNote" },
  // Orders recorded by hand by an Admin: never the active gateway at checkout.
  MANUAL: { name: "methodDemo", text: "methodDemoText", note: "methodNote" },
} as const;

/** Page frame: name in the top bar (<h1>); details on the left, the order summary sticks on the right from a 56rem box. */
const frame = "@container flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6";
const card = "rounded-2xl border border-bronze-700 bg-ink-900";

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  const tc = await getTranslations("common");
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{tc("loading")}</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-28 animate-pulse ${card}`} />
            ))}
          </div>
        }
      >
        <CheckoutContent locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function CheckoutContent({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  // Paying needs an account (CLAUDE.md §5); the guest cart is merged on sign-in, then we come back here.
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/checkout" } }, locale });
  const checkout = await getCheckout(user!.id, locale, await readCouponCode());
  if (!checkout) redirect({ href: { pathname: "/login", query: { callbackUrl: "/checkout" } }, locale });
  const { summary, buyer, method, testMode, amountSupported, amountRange } = checkout!;
  const [t, tc, tp, tpp, tcommon] = await Promise.all([
    getTranslations("checkout"),
    getTranslations("cart"),
    getTranslations("product"),
    getTranslations("productPage"),
    getTranslations("common"),
  ]);

  const payable = summary.lines.filter((l) => l.state === "ok");
  const skipped = summary.lines.length - payable.length;
  if (payable.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyText")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/cart">{t("backToCart")}</Link>
            </Button>
            <Button asChild>
              <Link href="/shop?type=premium">
                <ShoppingBag aria-hidden="true" className="size-4" />
                {tc("browsePremium")}
              </Link>
            </Button>
          </div>
        }
      />
    );
  }

  const { totals } = summary;
  const benefitRows = packBenefits(payable[0].benefits).map(({ key, included }) => ({ key, included, label: tpp(`benefits.${key}`) }));

  return (
    <div className="grid items-start gap-4 @[56rem]:grid-cols-[minmax(0,1fr)_20rem] @[56rem]:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        {method === "DEMO" && <DemoBanner title={t("demoBanner")} text={t("demoBannerText")} />}
        {method === "MOMO" && testMode && <DemoBanner title={t("momo.testBanner")} text={t("momo.testBannerText")} />}
        {method === "SEPAY" && testMode && <DemoBanner title={t("sepay.testBanner")} text={t("sepay.testBannerText")} />}

        <section aria-labelledby="checkout-buyer" className={`flex flex-col gap-3 p-5 ${card}`}>
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="checkout-buyer" className="font-sans text-base font-semibold text-ivory-100">
              {t("buyerTitle")}
            </h2>
            <Link href="/account" className="text-xs font-medium text-gold-300 underline-offset-2 hover:underline">
              {t("editProfile")}
            </Link>
          </header>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="grid gap-0.5">
              <dt className="text-ivory-500">{t("name")}</dt>
              <dd className="font-medium text-ivory-100 [overflow-wrap:anywhere]">{buyer.name}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-ivory-500">{t("email")}</dt>
              <dd className="font-medium text-ivory-100 [overflow-wrap:anywhere]" data-testid="checkout-email">
                {buyer.email}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-ivory-500">{t("buyerNote")}</p>
        </section>

        <section aria-labelledby="checkout-items" className={card}>
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
            <h2 id="checkout-items" className="font-sans text-base font-semibold text-ivory-100">
              {t("itemsTitle")}
            </h2>
            <Link href="/cart" className="text-xs font-medium text-gold-300 underline-offset-2 hover:underline">
              {t("backToCart")}
            </Link>
          </header>
          <ul aria-label={t("itemsLabel", { count: payable.length })} className="divide-y divide-bronze-700 border-t border-bronze-700" data-testid="checkout-lines">
            {payable.map((line) => (
              <li key={line.productId} className="flex items-center gap-3 p-4" data-testid="checkout-line">
                <div className="w-20 shrink-0 overflow-hidden rounded-lg sm:w-24">
                  <ProductThumb thumbnail={line.thumbnail} alt="" demoLabel={tcommon("demo")} noImageLabel={tp("noImage")} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-pretty text-ivory-100">{line.title}</span>
                  <span className="text-xs text-ivory-500">
                    {tc("packKind")}
                    {line.isDemoData && ` · ${tp("demoData")}`}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="font-semibold text-gold-300 tabular-nums">{formatVnd(line.priceVnd, locale)}</span>
                  {line.compareAtPriceVnd !== null && (
                    <span className="text-xs text-ivory-500 tabular-nums line-through">{formatVnd(line.compareAtPriceVnd, locale)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {skipped > 0 && <p className="border-t border-bronze-700 px-5 py-3 text-xs text-ivory-500">{t("skipped", { count: skipped })}</p>}
        </section>

        <section aria-labelledby="checkout-benefits" className={`flex flex-col gap-3 p-5 ${card}`}>
          <h2 id="checkout-benefits" className="font-sans text-sm font-semibold text-ivory-100">
            {t("benefitsTitle")}
          </h2>
          <BenefitList rows={benefitRows} included={tpp("included")} notIncluded={tpp("notIncluded")} twoColumns />
          {!payable[0].benefits.redistribution && !payable[0].benefits.resale && <p className="text-xs text-ivory-500">{tpp("benefitsNote")}</p>}
        </section>

        <section aria-labelledby="checkout-method" className={`flex flex-col gap-3 p-5 ${card}`}>
          <h2 id="checkout-method" className="font-sans text-base font-semibold text-ivory-100">
            {t("methodTitle")}
          </h2>
          {/* One method: the active gateway (env PAYMENT_PROVIDER) — the Demo gateway, the MoMo wallet (step 6.4) or a SePay bank transfer. */}
          <div className="flex items-start gap-3 rounded-xl border border-gold-500/60 bg-gold-500/5 p-4" data-testid="checkout-method" data-method={method}>
            <CircleDot aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold-300" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-ivory-100">{t(methodKeys[method].name)}</span>
              <span className="text-xs text-pretty text-ivory-300">{t(methodKeys[method].text)}</span>
            </div>
          </div>
          <p className="text-xs text-ivory-500">{t(methodKeys[method].note)}</p>
        </section>
      </div>

      {/* Summary: recomputed from the database on every render; the order is recomputed again on submit. */}
      <aside aria-labelledby="checkout-summary" className={`flex flex-col gap-4 p-5 @[56rem]:sticky @[56rem]:top-20 ${card}`} data-testid="checkout-summary">
        <h2 id="checkout-summary" className="font-sans text-base font-semibold text-ivory-100">
          {t("summaryTitle")}
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ivory-300">{tc("packCount", { count: totals.payableCount })}</dt>
            <dd className="text-ivory-100 tabular-nums">{formatVnd(totals.subtotalVnd + totals.savingsVnd, locale)}</dd>
          </div>
          {totals.savingsVnd > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-ivory-300">{tc("savings")}</dt>
              <dd className="text-jade-400 tabular-nums">−{formatVnd(totals.savingsVnd, locale)}</dd>
            </div>
          )}
          {summary.discountVnd > 0 && (
            <div className="flex justify-between gap-3" data-testid="checkout-discount">
              <dt className="text-ivory-300">{tc("coupon.discountLine", { code: summary.coupon?.code ?? "" })}</dt>
              <dd className="text-jade-400 tabular-nums">−{formatVnd(summary.discountVnd, locale)}</dd>
            </div>
          )}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-bronze-700 pt-3">
            <dt className="font-medium text-ivory-100">{tc("total")}</dt>
            <dd className="text-xl font-semibold text-gold-300 tabular-nums" data-testid="checkout-total">
              {formatVnd(summary.totalVnd, locale)}
            </dd>
          </div>
        </dl>
        {!amountSupported && (
          <p role="note" className="text-sm text-pretty text-cinnabar-500 light:text-cinnabar-600" data-testid="checkout-amount-note">
            {t("errors.amountNotSupported", gatewayLimits(locale, amountRange))}
          </p>
        )}
        <PlaceOrderForm action={placeOrderAction.bind(null, locale)} totalVnd={summary.totalVnd} />
        <p className="text-xs text-pretty text-ivory-500">
          {t.rich("agree", {
            terms: (c) => (
              <Link href="/terms" className="text-ivory-300 underline underline-offset-4 hover:text-ivory-100">
                {c}
              </Link>
            ),
            refund: (c) => (
              <Link href="/refund" className="text-ivory-300 underline underline-offset-4 hover:text-ivory-100">
                {c}
              </Link>
            ),
          })}
        </p>
      </aside>
    </div>
  );
}
