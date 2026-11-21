"use client";

import { ChartColumn, LogOut, ReceiptText, Settings, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { overlayItem, overlayList, overlayPanel } from "@/components/ui/overlay-styles";
import { useToast } from "@/components/ui/toast";
import { Link, usePathname, useRouter } from "@backend/i18n/navigation";
import { isAuthPath } from "@backend/lib/auth/callback";
import { cn } from "@/lib/cn";
import { logoutAction } from "@backend/modules/user/actions";

const iconButton =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100";

/** Signed out: account icon → sign-in page, coming back to the current page afterwards. */
export function SignInLink() {
  const t = useTranslations("header");
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}${search ? `?${search}` : ""}`;
  // Auth pages are never a place to come back to; a reset page would even put its token into the URL (GĐ6.2).
  const query = isAuthPath(pathname) || pathname === "/shop" ? undefined : { callbackUrl: here };
  return (
    <Link href={{ pathname: "/login", query }} aria-label={t("signIn")} title={t("signIn")} data-testid="sign-in-link" className={iconButton}>
      <UserRound aria-hidden="true" className="size-5" />
    </Link>
  );
}

/**
 * Signed in: round avatar with the name's first letter → menu with who is signed in and "Sign out"
 * (evondevKit overlay "Dropdown"): Account page, Statistics (the user's own numbers), Orders, Sign out.
 * Admins also get "Admin" first (decision "Admin (GĐ5)"); the Admin area checks the role again on the server.
 */
export function AccountMenu({ name, email, isAdmin = false }: { name: string; email: string; isAdmin?: boolean }) {
  const t = useTranslations("header");
  const tn = useTranslations("nav");
  const ta = useTranslations("admin");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const initial = (name.trim()[0] ?? email[0] ?? "?").toLocaleUpperCase();

  const signOut = () =>
    startTransition(async () => {
      await logoutAction();
      toast({ variant: "success", title: t("signedOut") });
      router.refresh();
    });

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={t("accountMenu", { name })}
        title={name}
        data-testid="account-menu"
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-300 ring-1 ring-gold-500/30 transition-colors hover:bg-gold-500/25 data-[state=open]:bg-gold-500/25"
      >
        <span aria-hidden="true">{initial}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={16} className={cn(overlayPanel, "w-64")}>
          <div className="flex flex-col gap-0.5 border-b border-bronze-700 px-4 py-3">
            <p className="text-sm font-semibold break-words text-ivory-100">{name}</p>
            <p className="text-xs break-all text-ivory-500">{email}</p>
          </div>
          <div className={overlayList}>
            {isAdmin && (
              <DropdownMenu.Item asChild>
                <Link href="/admin" data-testid="admin-link" className={overlayItem}>
                  <ShieldCheck aria-hidden="true" className="size-4 text-gold-400" />
                  {ta("menuEntry")}
                </Link>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item asChild>
              <Link href="/account" data-testid="account-link" className={overlayItem}>
                <Settings aria-hidden="true" className="size-4 text-ivory-500" />
                {tn("account")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link href="/stats" data-testid="stats-link" className={overlayItem}>
                <ChartColumn aria-hidden="true" className="size-4 text-ivory-500" />
                {tn("stats")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link href="/orders" data-testid="orders-link" className={overlayItem}>
                <ReceiptText aria-hidden="true" className="size-4 text-ivory-500" />
                {tn("orders")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={pending}
              onSelect={signOut}
              data-testid="sign-out"
              className={cn(overlayItem, "data-[disabled]:opacity-50")}
            >
              <LogOut aria-hidden="true" className="size-4 text-ivory-500" />
              {t("signOut")}
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
