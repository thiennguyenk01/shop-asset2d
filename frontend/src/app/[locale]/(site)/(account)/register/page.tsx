import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AuthCard, AuthFormSkeleton } from "@/components/account/auth-card";
import { RegisterForm } from "@/components/account/auth-forms";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { Link, redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { DEFAULT_AFTER_LOGIN, safeCallbackPath } from "@backend/lib/auth/callback";
import { googleSignInEnabled } from "@backend/auth";
import { getCurrentUser } from "@backend/auth/current-user";
import { googleSignInAction, registerAction } from "@backend/modules/user/actions";

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
      <p className="mt-4 text-xs text-pretty text-ivory-500" data-testid="register-agree">
        {t.rich("agree", { terms: (c) => <PolicyLink href="/terms">{c}</PolicyLink>, privacy: (c) => <PolicyLink href="/privacy">{c}</PolicyLink> })}
      </p>
    </AuthCard>
  );
}

function PolicyLink({ href, children }: { href: "/terms" | "/privacy"; children: ReactNode }) {
  return (
    <Link href={href} className="text-ivory-300 underline underline-offset-4 hover:text-ivory-100">
      {children}
    </Link>
  );
}

type Search = PageProps<"/[locale]/register">["searchParams"];

async function RegisterContent({ locale, searchParams }: { locale: Locale; searchParams: Search }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const callbackUrl = safeCallbackPath(sp.callbackUrl);
  if (user) redirect({ href: callbackUrl, locale }); // already signed in
  const back = callbackUrl === DEFAULT_AFTER_LOGIN ? undefined : callbackUrl;
  return (
    <div className="flex flex-col gap-4">
      {/* Google creates the account on first use (user choice 2026-11-26). */}
      {googleSignInEnabled() && <GoogleSignIn action={googleSignInAction.bind(null, locale, back)} />}
      <RegisterForm action={registerAction.bind(null, locale)} callbackUrl={back} />
    </div>
  );
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
