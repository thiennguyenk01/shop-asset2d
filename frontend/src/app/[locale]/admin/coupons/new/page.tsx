import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CouponForm, type CouponFormValues } from "@/components/admin/coupon-form";
import { Link } from "@backend/i18n/navigation";
import { requireAdminPage } from "@backend/auth/admin-page";
import { createCouponAction } from "@backend/modules/coupon/admin-actions";

/** Waits for the Admin check (404 for anyone else): see the note on `instant` in frontend/src/app/[locale]/admin/layout.tsx. */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminCoupons");
  return { title: t("newTitle") };
}

const EMPTY: CouponFormValues = {
  code: "",
  kind: "PERCENT",
  value: "",
  minTotalVnd: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerUser: "",
  isActive: true,
};

/** New coupon (GĐ5.6, DECISIONS #35). */
export default async function NewCouponPage({ params }: PageProps<"/[locale]/admin/coupons/new">) {
  const t = await getTranslations("adminCoupons");
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ivory-300 hover:text-ivory-100"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ivory-100">{t("newTitle")}</h1>
        <p className="text-sm text-pretty text-ivory-500">{t("newIntro")}</p>
      </header>
      <Suspense
        fallback={
          <div className="h-96 animate-pulse rounded-2xl border border-bronze-700 bg-ink-900" aria-hidden="true" />
        }
      >
        <NewForm params={params} />
      </Suspense>
    </div>
  );
}

async function NewForm({ params }: { params: Promise<{ locale: string }> }) {
  await requireAdminPage();
  const { locale } = await params;
  return <CouponForm mode="create" action={createCouponAction.bind(null, locale)} initial={EMPTY} locked={false} />;
}
