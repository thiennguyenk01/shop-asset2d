import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_CLIENT_MESSAGES, pickMessages } from "@/i18n/client-messages";
import { requireAdminPage } from "@backend/auth/admin-page";

/** The Admin area is never indexed (and is a 404 for everyone but Admins anyway). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The Admin area waits for the session check by design, and for anyone but an Admin it always 404s, so it can
 * never produce an instant UI. Opt it out of Cache Components' instant-navigation validation (otherwise the dev
 * overlay reports "Could not validate `instant`…" whenever a non-Admin opens /admin). The 404 is unchanged.
 */
export const instant = false;

/**
 * Admin area (decision "Admin (GĐ5)"). The shell — menu included — is drawn only after the session says
 * Admin; anyone else gets the store's ordinary 404 (app/[locale]/not-found.tsx). Each page checks again
 * (requireAdminPage) because layouts are not re-run on client navigation.
 */
export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink-950" aria-hidden="true" />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdminPage();
  // The Admin texts its client components read, on top of the site set (GĐ7.3; only after the Admin check).
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, ADMIN_CLIENT_MESSAGES)}>
      <AdminShell>{children}</AdminShell>
    </NextIntlClientProvider>
  );
}
