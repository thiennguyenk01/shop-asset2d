import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthCard, AuthFormSkeleton } from "@/components/account/auth-card";
import { FormError, LoginForm } from "@/components/account/auth-forms";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { DEFAULT_AFTER_LOGIN, safeCallbackPath } from "@backend/lib/auth/callback";
import { googleErrorFromParam } from "@backend/lib/auth/google";
import { googleSignInEnabled } from "@backend/auth";
import { getCurrentUser } from "@backend/auth/current-user";
import { googleSignInAction, loginAction } from "@backend/modules/user/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const t = await getTranslations("auth.login");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Suspense fallback={<span className="invisible">{t("noAccount")}</span>}>
          <SwitchLink searchParams={searchParams} />
        </Suspense>
      }
    >
      {/* Reads the session and the query string, so it streams in behind the card. */}
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <LoginContent locale={locale as Locale} searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

type Search = PageProps<"/[locale]/login">["searchParams"];

async function LoginContent({ locale, searchParams }: { locale: Locale; searchParams: Search }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const callbackUrl = safeCallbackPath(sp.callbackUrl);
  if (user) redirect({ href: callbackUrl, locale }); // already signed in
  const back = callbackUrl === DEFAULT_AFTER_LOGIN ? undefined : callbackUrl;
  // A Google attempt that did not sign in comes back here with ?error= (user choice 2026-11-26).
  const googleError = googleErrorFromParam(sp.error);
  const tg = await getTranslations("auth.google");
  return (
    <div className="flex flex-col gap-4">
      {googleSignInEnabled() ? (
        <GoogleSignIn action={googleSignInAction.bind(null, locale, back)} error={googleError} />
      ) : (
        googleError && <FormError message={tg(`errors.${googleError}`)} />
      )}
      <LoginForm action={loginAction.bind(null, locale)} callbackUrl={back} />
    </div>
  );
}

async function SwitchLink({ searchParams }: { searchParams: Search }) {
  const [t, sp] = await Promise.all([getTranslations("auth.login"), searchParams]);
  const callbackUrl = safeCallbackPath(sp.callbackUrl);
  const query = callbackUrl === DEFAULT_AFTER_LOGIN ? undefined : { callbackUrl };
  return (
    <>
      {t("noAccount")}{" "}
      <Link href={{ pathname: "/register", query }} className="font-medium text-gold-300 underline-offset-4 hover:underline">
        {t("registerLink")}
      </Link>
    </>
  );
}
