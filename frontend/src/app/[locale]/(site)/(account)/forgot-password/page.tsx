import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/account/auth-card";
import { ForgotPasswordForm } from "@/components/account/auth-forms";
import { Link } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { RESET_TTL_MINUTES } from "@backend/lib/auth/password-reset";
import { forgotPasswordAction } from "@backend/modules/user/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title"), robots: { index: false } };
}

/**
 * "Forgot password" (GĐ6.2). Open to everyone, signed in or not; the answer never tells whether the email has an
 * account. The mail goes out in this page's language.
 */
export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  const t = await getTranslations("auth.forgot");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("rememberPassword")}{" "}
          <Link href="/login" className="font-medium text-gold-300 underline-offset-4 hover:underline">
            {t("loginLink")}
          </Link>
        </>
      }
    >
      <ForgotPasswordForm action={forgotPasswordAction.bind(null, locale as Locale)} minutes={RESET_TTL_MINUTES} />
    </AuthCard>
  );
}
