import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderPanel } from "@/components/checkout/order-panel";
import type { Locale } from "@backend/i18n/routing";
/**
 * Order codes are only known at request time. One placeholder param lets Cache Components resolve the
 * pathname of the shared layout (sidebar, top bar) at build time, as the product page does; real values render
 * on demand (the content reads the session inside <Suspense>). See CLAUDE.md §1 "usePathname".
 */
export function generateStaticParams() {
  return [{ code: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("checkout"), robots: { index: false } };
}

/**
 * Payment result (CLAUDE.md §6 step 3): it ONLY shows the order's state. While PENDING it re-renders every
 * few seconds; it never grants anything (only the verified webhook does).
 */
export default function OrderResultPage({ params }: PageProps<"/[locale]/checkout/result/[code]">) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" />}>
        <OrderResult params={params} />
      </Suspense>
    </div>
  );
}

async function OrderResult({ params }: { params: PageProps<"/[locale]/checkout/result/[code]">["params"] }) {
  const { locale, code } = await params;
  return <OrderPanel code={code} locale={locale as Locale} returnPath={`/checkout/result/${code}`} />;
}
