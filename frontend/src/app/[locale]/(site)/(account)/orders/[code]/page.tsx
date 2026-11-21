import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderPanel } from "@/components/checkout/order-panel";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";

/** Order codes are only known at request time — placeholder param, as the payment result page (CLAUDE.md §1). */
export function generateStaticParams() {
  return [{ code: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders"), robots: { index: false } };
}

/** One order from the history: same panel as the payment result page, with a way back to the list. */
export default async function OrderDetailPage({ params }: PageProps<"/[locale]/orders/[code]">) {
  const t = await getTranslations("orders");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link href="/orders" data-testid="back-to-orders">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("backToOrders")}
        </Link>
      </Button>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" />}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({ params }: { params: PageProps<"/[locale]/orders/[code]">["params"] }) {
  const { locale, code } = await params;
  return <OrderPanel code={code} locale={locale as Locale} returnPath={`/orders/${code}`} />;
}
