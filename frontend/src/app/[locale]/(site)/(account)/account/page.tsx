import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AuthFormSkeleton } from "@/components/account/auth-card";
import { ChangePasswordForm, ProfileForm, SetPasswordForm } from "@/components/account/account-forms";
import { redirect } from "@backend/i18n/navigation";
import type { Locale } from "@backend/i18n/routing";
import { getCurrentUser } from "@backend/auth/current-user";
import { changePasswordAction, setPasswordAction, updateProfileAction } from "@backend/modules/user/account-actions";
import { getProfile, getSignInMethods } from "@backend/modules/user/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("account"), robots: { index: false } };
}

/** Settings page frame: the page name is the <h1> in the top bar; content is a narrow column of cards. */
const frame = "flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6";

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  return (
    <div className={frame}>
      <Suspense
        fallback={
          <>
            <Card title="" skeleton>
              <AuthFormSkeleton fields={2} />
            </Card>
            <Card title="" skeleton>
              <AuthFormSkeleton fields={3} />
            </Card>
          </>
        }
      >
        <AccountContent locale={locale as Locale} />
      </Suspense>
    </div>
  );
}

async function AccountContent({ locale }: { locale: Locale }) {
  const user = await getCurrentUser();
  // Signed out (or session revoked): sign in, then come back here. The actions re-check on their own too.
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/account" } }, locale });
  const [profile, methods, t, format] = await Promise.all([
    getProfile(user!.id),
    getSignInMethods(user!.id),
    getTranslations("account"),
    getFormatter(),
  ]);
  if (!profile || !methods) redirect({ href: { pathname: "/login", query: { callbackUrl: "/account" } }, locale });

  return (
    <>
      <Card
        title={t("profileTitle")}
        intro={t("profileIntro")}
        meta={t("memberSince", { date: format.dateTime(profile!.createdAt, { dateStyle: "long" }) })}
      >
        <ProfileForm action={updateProfileAction} name={profile!.name ?? ""} email={profile!.email} />
      </Card>
      {/* An account created with Google has no password: it can set one (user choice 2026-11-26). */}
      {methods!.hasPassword ? (
        <Card title={t("passwordTitle")} intro={t("passwordIntro")} meta={methods!.google ? t("googleLinked") : undefined}>
          <ChangePasswordForm action={changePasswordAction} />
        </Card>
      ) : (
        <Card title={t("setPassword.title")} intro={t("setPassword.intro")} meta={methods!.google ? t("googleLinked") : undefined}>
          <SetPasswordForm action={setPasswordAction} />
        </Card>
      )}
    </>
  );
}

function Card({ title, intro, meta, skeleton, children }: { title: string; intro?: string; meta?: string; skeleton?: boolean; children: ReactNode }) {
  return (
    <section aria-label={skeleton ? undefined : title} className="flex flex-col gap-5 rounded-2xl border border-bronze-700 bg-ink-900 p-5 sm:p-6">
      {skeleton ? (
        <div aria-hidden="true" className="h-6 w-32 animate-pulse rounded bg-ink-800" />
      ) : (
        <header className="flex flex-col gap-1">
          <h2 className="font-sans text-base font-semibold text-ivory-100">{title}</h2>
          {intro && <p className="text-sm text-pretty text-ivory-300">{intro}</p>}
          {meta && <p className="text-xs text-ivory-500">{meta}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
