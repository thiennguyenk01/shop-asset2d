import { Info, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CheckoutButton, RemoveFromCartButton } from "@/components/cart/cart-line-actions";
import { CouponBox, type AppliedCoupon } from "@/components/cart/coupon-box";
import { BenefitList } from "@/components/product/benefit-list";
import { ProductThumb } from "@/components/product/product-thumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { packBenefits } from "@backend/lib/catalog/benefits";
import { cn } from "@/lib/cn";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { applyCouponAction } from "@backend/modules/cart/actions";
import { getCartSummary, type CartLine } from "@backend/modules/cart/service";
import { readCartOwner, readCouponCode } from "@backend/modules/cart/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("cart"), robots: { index: false } };
}

/** Page frame: name in the top bar (<h1>); lines on the left, the summary column sticks on the right from a 56rem box. */
const frame = "@container flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6";

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  const tc = await getTranslations("common");
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">{tc("loading")}</span>
            {[0, 1].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" />
            ))}
          </div>
        }
      >
        <CartContent locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function CartContent({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  const [owner, couponCode] = await Promise.all([readCartOwner(user?.id ?? null), readCouponCode()]);
  // Totals and the coupon are recomputed from the database on every render (never trusted from the client).
  const view = await getCartSummary(owner, locale, couponCode);
  const [t, tp, tpp, tcommon] = await Promise.all([getTranslations("cart"), getTranslations("product"), getTranslations("productPage"), getTranslations("common")]);

  if (view.lines.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyText")}
        action={
          <Button asChild>
            <Link href="/shop?type=premium">
              <ShoppingBag aria-hidden="true" className="size-4" />
              {t("browsePremium")}
            </Link>
          </Button>
        }
      />
    );
  }

  const { totals } = view;
  const applied: AppliedCoupon | null = view.coupon?.code
    ? view.coupon.ok
      ? { code: view.coupon.code, ok: true, discountVnd: view.coupon.discountVnd }
      : { code: view.coupon.code, ok: false, problem: view.coupon.problem, minTotalVnd: view.coupon.minTotalVnd }
    : null;
  const firstPayable = view.lines.find((l) => l.state === "ok");
  const benefitRows = firstPayable
    ? packBenefits(firstPayable.benefits).map(({ key, included }) => ({ key, included, label: tpp(`benefits.${key}`) }))
    : [];
  const hasDemo = view.lines.some((l) => l.isDemoData);

  return (
    <div className="grid items-start gap-4 @[56rem]:grid-cols-[minmax(0,1fr)_20rem] @[56rem]:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        {hasDemo && (
          <div role="status" className="flex gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-4">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold-400" />
            <p className="text-sm text-pretty text-ivory-300">{t("demoNotice")}</p>
          </div>
        )}
        <section aria-label={t("linesLabel", { count: view.lines.length })} className="rounded-2xl border border-bronze-700 bg-ink-900">
          <ul className="divide-y divide-bronze-700" data-testid="cart-lines">
            {view.lines.map((line) => (
              <CartLineRow key={line.productId} line={line} locale={locale} labels={{ demo: tcommon("demo") /* short pill: the thumbnail is small */, noImage: tp("noImage"), demoData: tp("demoData") }} />
            ))}
          </ul>
        </section>
        {firstPayable && (
          <section aria-labelledby="cart-benefits" className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5">
            <h2 id="cart-benefits" className="font-sans text-sm font-semibold text-ivory-100">
              {t("benefitsTitle")}
            </h2>
            <BenefitList rows={benefitRows} included={tpp("included")} notIncluded={tpp("notIncluded")} twoColumns />
            {!firstPayable.benefits.redistribution && !firstPayable.benefits.resale && (
              <p className="text-xs text-ivory-500">{tpp("benefitsNote")}</p>
            )}
          </section>
        )}
      </div>

      {/* Summary: totals are recomputed from the current prices on every render; nothing is trusted from the client. */}
      <aside
        aria-labelledby="cart-summary"
        className="flex flex-col gap-4 rounded-2xl border border-bronze-700 bg-ink-900 p-5 @[56rem]:sticky @[56rem]:top-20"
        data-testid="cart-summary"
      >
        <h2 id="cart-summary" className="font-sans text-base font-semibold text-ivory-100">
          {t("summaryTitle")}
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ivory-300">{t("packCount", { count: totals.payableCount })}</dt>
            <dd className="text-ivory-100 tabular-nums">{formatVnd(totals.subtotalVnd + totals.savingsVnd, locale)}</dd>
          </div>
          {totals.savingsVnd > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-ivory-300">{t("savings")}</dt>
              <dd className="text-jade-400 tabular-nums">−{formatVnd(totals.savingsVnd, locale)}</dd>
            </div>
          )}
          {view.discountVnd > 0 && (
            <div className="flex justify-between gap-3" data-testid="cart-discount">
              <dt className="text-ivory-300">{t("coupon.discountLine", { code: view.coupon?.code ?? "" })}</dt>
              <dd className="text-jade-400 tabular-nums">−{formatVnd(view.discountVnd, locale)}</dd>
            </div>
          )}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-bronze-700 pt-3">
            <dt className="font-medium text-ivory-100">{t("total")}</dt>
            <dd className="text-xl font-semibold text-gold-300 tabular-nums" data-testid="cart-total">
              {formatVnd(view.totalVnd, locale)}
            </dd>
          </div>
        </dl>
        <CouponBox action={applyCouponAction.bind(null, locale)} applied={applied} locale={locale} />
        <CheckoutButton signedIn={!!user} disabled={totals.payableCount === 0} />
        {!user && <p className="text-xs text-pretty text-ivory-500">{t("signInNote")}</p>}
        <Button asChild variant="ghost" className="w-full">
          <Link href="/shop">{t("continueShopping")}</Link>
        </Button>
      </aside>
    </div>
  );
}

async function CartLineRow({ line, locale, labels }: { line: CartLine; locale: Locale; labels: { demo: string; noImage: string; demoData: string } }) {
  const t = await getTranslations("cart");
  const payable = line.state === "ok";
  return (
    <li className="flex items-start gap-3 p-4 sm:gap-4" data-testid="cart-line" data-state={line.state}>
      <Link href={`/product/${line.slug}`} className="w-24 shrink-0 overflow-hidden rounded-xl sm:w-32" tabIndex={-1} aria-hidden="true">
        <ProductThumb thumbnail={line.thumbnail} alt="" demoLabel={labels.demo} noImageLabel={labels.noImage} className={cn(!payable && "opacity-50")} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/product/${line.slug}`} className="font-medium text-pretty text-ivory-100 hover:text-gold-300">
          {line.title}
        </Link>
        <p className="text-xs text-ivory-500">
          {t("packKind")}
          {line.isDemoData && ` · ${labels.demoData}`}
        </p>
        {!payable && (
          <p className={cn("text-xs font-medium", line.state === "owned" ? "text-jade-400" : "text-cinnabar-500 light:text-cinnabar-600")}>
            {line.state === "owned" ? t("lineOwned") : t("lineUnavailable")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("font-semibold tabular-nums", payable ? "text-gold-300" : "text-ivory-500 line-through")}>{formatVnd(line.priceVnd, locale)}</span>
        {payable && line.compareAtPriceVnd !== null && (
          <span className="text-xs text-ivory-500 tabular-nums line-through">{formatVnd(line.compareAtPriceVnd, locale)}</span>
        )}
        <RemoveFromCartButton productId={line.productId} title={line.title} />
      </div>
    </li>
  );
}
