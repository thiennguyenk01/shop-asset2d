import { AlertCircle, LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard, AuthFormSkeleton } from "@/components/account/auth-card";
import { ResetPasswordForm } from "@/components/account/auth-forms";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { resetPasswordAction } from "@backend/modules/user/actions";
import { isResetLinkUsable } from "@backend/modules/user/password-reset-service";

/** Reset tokens are only known at request time — placeholder param, as the order pages (.claude/rules/nextjs.md). */
export function generateStaticParams() {
  return [{ token: "__none__" }];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  // The token is in the URL: never index it, never send it on as a referrer.
  return { title: t("title"), robots: { index: false }, referrer: "no-referrer" };
}

/** Page opened from the reset mail (GĐ6.2): the new-password form, or "this link no longer works". */
export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password/[token]">) {
  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <ResetContent params={params} />
      </Suspense>
    </AuthCard>
  );
}

async function ResetContent({ params }: { params: PageProps<"/[locale]/reset-password/[token]">["params"] }) {
  const { locale, token } = await params;
  await connection(); // request time only: the check reads the clock and the database, never prerendered
  if (!(await isResetLinkUsable(token))) {
    const t = await getTranslations("auth.reset");
    return (
      <div className="flex flex-col gap-4" data-testid="reset-invalid">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-cinnabar-600/60 bg-cinnabar-700/10 px-4 py-3.5"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-cinnabar-500" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ivory-100">{t("invalidTitle")}</p>
            <p className="text-sm text-pretty text-ivory-300">{t("invalidText")}</p>
          </div>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">
            <LinkIcon aria-hidden="true" className="size-4" />
            {t("requestNew")}
          </Link>
        </Button>
      </div>
    );
  }
  return <ResetPasswordForm action={resetPasswordAction.bind(null, locale as Locale, token)} />;
}
