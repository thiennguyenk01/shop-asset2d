"use client";

import { Check, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useTransition } from "react";
import { usePathname, useRouter } from "@backend/i18n/navigation";
import { routing, type Locale } from "@backend/i18n/routing";
import { overlayItem, overlayList, overlayPanel } from "@/components/ui/overlay-styles";
import { cn } from "@/lib/cn";

/**
 * Language switcher (CLAUDE.md §8): keeps the current page and query string (filters);
 * cart (DB) and auth (cookie) are unaffected. next-intl updates the NEXT_LOCALE cookie.
 * Language names are autonyms ("Tiếng Việt", "English") in both modes, by convention.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("localeSwitcher");
  const current = useLocale() as Locale;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { locale });
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t("current", { language: t(current) })}
        disabled={isPending}
        data-testid="locale-switcher"
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ivory-100/70",
          "transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 data-[state=open]:bg-ivory-100/5 data-[state=open]:text-ivory-100",
          className,
        )}
      >
        <Globe aria-hidden="true" className="size-4 text-gold-400" />
        <span className="uppercase">{current}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className={cn(overlayPanel, overlayList, "min-w-48")}
        >
          <DropdownMenu.Label className="flex h-8 items-center px-3 text-xs text-ivory-500">{t("label")}</DropdownMenu.Label>
          {routing.locales.map((locale) => (
            <DropdownMenu.Item
              key={locale}
              lang={locale}
              onSelect={() => switchTo(locale)}
              data-testid={`locale-${locale}`}
              className={cn(overlayItem, "justify-between", locale === current && "font-medium")}
            >
              {t(locale)}
              {locale === current && <Check aria-hidden="true" className="size-4 text-gold-400" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
