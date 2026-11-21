import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DemoPaymentButtons } from "@/components/checkout/checkout-client";
import { DemoBanner } from "@/components/checkout/demo-banner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Seal } from "@/components/ui/seal";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { completeDemoPaymentAction } from "@backend/modules/payment/actions";
import { getDemoPayment } from "@backend/modules/payment/demo-gateway";

/**
 * Transaction ids are only known at request time. One placeholder param lets Cache Components resolve the
 * pathname of the shared layout (sidebar, top bar) at build time, as the product page does; real values render
 * on demand (the content reads the session inside <Suspense>). See CLAUDE.md §1 "usePathname".
 */
export function generateStaticParams() {
  return [{ txn: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout.demo");
  return { title: t("title"), robots: { index: false } };
}

/**
 * The Demo gateway page (CLAUDE.md §6). Stands in for a real gateway's hosted page: it shows the amount and
 * lets the buyer choose succeed / fail. Owner-only, demo mode only, and it never changes an order itself.
 */
export default function DemoGatewayPage({ params }: PageProps<"/[locale]/checkout/demo/[txn]">) {
  return (
    <div className="flex w-full max-w-xl flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" />}>
        <DemoGateway params={params} />
      </Suspense>
    </div>
  );
}

async function DemoGateway({ params }: { params: PageProps<"/[locale]/checkout/demo/[txn]">["params"] }) {
  const { locale: raw, txn } = await params;
  const locale = raw as Locale;
  const user = await getCurrentUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: `/checkout/demo/${txn}` } }, locale });
  const [t, tc, format] = await Promise.all([getTranslations("checkout"), getTranslations("cart"), getFormatter()]);
  const view = await getDemoPayment(txn, user!.id);

  if (!view) {
    return (
      <ErrorState
        title={t("demo.notFoundTitle")}
        description={t("demo.notFoundText")}
        action={
          <Button asChild variant="secondary">
            <Link href="/cart">{tc("continueShopping")}</Link>
          </Button>
        }
      />
    );
  }
  // Already settled or expired: the result page tells the real state.
  if (!view.payable) redirect({ href: `/checkout/result/${view.orderCode}`, locale });

  return (
    <>
      <DemoBanner title={t("demoBanner")} text={t("demoBannerText")} />
      <section aria-labelledby="demo-title" className="flex flex-col gap-5 rounded-2xl border border-bronze-700 bg-ink-900 p-5 sm:p-6" data-testid="demo-gateway">
        <header className="flex items-start gap-4">
          <Seal glyphs="宝印" size="md" />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="demo-title" className="font-heading text-xl text-ivory-100">
              {t("demo.title")}
            </h2>
            <p className="text-sm text-pretty text-ivory-300">{t("demo.intro")}</p>
          </div>
        </header>
        <dl className="grid gap-3 rounded-xl border border-bronze-700 bg-ink-950/40 p-4 text-sm sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="text-ivory-500">{t("demo.order")}</dt>
            <dd className="font-medium tracking-wide text-ivory-100 tabular-nums" data-testid="demo-order-code">
              {view.orderCode}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-ivory-500">{t("demo.amount")}</dt>
            <dd className="text-lg font-semibold text-gold-300 tabular-nums" data-testid="demo-amount">
              {formatVnd(view.amountVnd, locale)}
            </dd>
          </div>
          <div className="grid gap-0.5 text-xs text-ivory-500 sm:col-span-2">
            <span>
              {view.extraDownloads ? t("demo.extraDownloads", { count: view.extraDownloads }) : t("demo.items", { count: view.itemCount })}
              {view.expiresAt && ` · ${t("demo.expires", { time: format.dateTime(view.expiresAt, { timeStyle: "short" }) })}`}
            </span>
          </div>
        </dl>
        <DemoPaymentButtons action={completeDemoPaymentAction.bind(null, locale, txn)} />
        <Button asChild variant="ghost" className="w-full">
          {/* A "more downloads" order did not come from the cart: back to the library instead. */}
          <Link href={view.extraDownloads ? "/library" : "/cart"}>{view.extraDownloads ? t("demo.cancelToLibrary") : t("demo.cancel")}</Link>
        </Button>
      </section>
    </>
  );
}
