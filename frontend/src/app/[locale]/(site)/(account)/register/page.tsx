import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard, AuthFormSkeleton } from "@/components/account/auth-card";
import { RegisterForm } from "@/components/account/auth-forms";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { DEFAULT_AFTER_LOGIN, safeCallbackPath } from "@backend/lib/auth/callback";
import { getCurrentUser } from "@backend/auth/current-user";
import { registerAction } from "@backend/modules/user/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("title"), robots: { index: false } };
}

export default async function RegisterPage({ params, searchParams }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  const t = await getTranslations("auth.register");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Suspense fallback={<span className="invisible">{t("haveAccount")}</span>}>
          <SwitchLink searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<AuthFormSkeleton fields={4} />}>
        <RegisterContent locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

type Search = PageProps<"/[locale]/register">["searchParams"];

async function RegisterContent({ locale, searchParams }: { locale: Locale; searchParams: Search }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const callbackUrl = safeCallbackPath(sp.callbackUrl);
  if (user) redirect({ href: callbackUrl, locale }); // already signed in
  return <RegisterForm action={registerAction.bind(null, locale)} callbackUrl={callbackUrl === DEFAULT_AFTER_LOGIN ? undefined : callbackUrl} />;
}

async function SwitchLink({ searchParams }: { searchParams: Search }) {
  const [t, sp] = await Promise.all([getTranslations("auth.register"), searchParams]);
  const callbackUrl = safeCallbackPath(sp.callbackUrl);
  const query = callbackUrl === DEFAULT_AFTER_LOGIN ? undefined : { callbackUrl };
  return (
    <>
      {t("haveAccount")}{" "}
      <Link href={{ pathname: "/login", query }} className="font-medium text-gold-300 underline-offset-4 hover:underline">
        {t("loginLink")}
      </Link>
    </>
  );
}
