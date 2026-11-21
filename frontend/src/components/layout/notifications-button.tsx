"use client";

import { Bell, Languages, ReceiptText, type LucideIcon } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { overlayPanel } from "@/components/ui/overlay-styles";
import { Link } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";

/** One notification, already translated by the server (account/order phases fill these in). */
export type NotificationItem = {
  id: string;
  message: string;
  category: string;
  /** When it happened; without it the row shows the category only. */
  at?: Date;
  href?: string;
  unread?: boolean;
  /** Round icon of the row (a name, so a server component can pass it); default: bell. */
  icon?: NotificationIcon;
};
export type NotificationIcon = "bell" | "order" | "translation";
const ICONS: Record<NotificationIcon, LucideIcon> = { bell: Bell, order: ReceiptText, translation: Languages };

/** Texts of the button and panel, already translated (the Admin bell uses its own); default: `notifications.*`. */
export type NotificationsCopy = { label: string; title: string; emptyTitle: string; emptyText: string };

/**
 * Bell in the top bar, left of the account button (user request, design ref = their screenshot): opens a
 * panel titled "Notifications" with one row per item — round icon, message, "category · relative time".
 * No account system yet, so the list is empty and says so honestly; nothing is invented.
 */
export function NotificationsButton({
  items = [],
  copy,
  testId = "notifications",
}: {
  items?: NotificationItem[];
  copy?: NotificationsCopy;
  /** Prefix of the test ids (`<testId>-button`, `<testId>-panel`). */
  testId?: string;
}) {
  const t = useTranslations("notifications");
  const unread = items.filter((n) => n.unread).length;
  const label = copy?.label ?? (unread > 0 ? t("openUnread", { count: unread }) : t("open"));
  const titleId = `${testId}-title`;

  return (
    <Popover.Root>
      <Popover.Trigger
        data-testid={`${testId}-button`}
        aria-label={label}
        title={label}
        className="relative grid size-9 cursor-pointer place-items-center rounded-lg text-ivory-100/70 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 data-[state=open]:bg-ivory-100/5 data-[state=open]:text-ivory-100"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full bg-cinnabar-500 ring-2 ring-ink-950"
          />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={titleId}
          data-testid={`${testId}-panel`}
          className={cn(overlayPanel, "flex w-96 max-w-[calc(100vw-2rem)] flex-col")}
        >
          <h2
            id={titleId}
            className="border-b border-bronze-700 px-4 py-3 font-sans text-sm font-semibold text-ivory-100"
          >
            {copy?.title ?? t("title")}
          </h2>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-ivory-100/5">
                <Bell aria-hidden="true" className="size-5 text-ivory-500" />
              </span>
              <p className="text-sm font-medium text-ivory-100">{copy?.emptyTitle ?? t("emptyTitle")}</p>
              <p className="max-w-[32ch] text-xs text-pretty text-ivory-500">{copy?.emptyText ?? t("emptyText")}</p>
            </div>
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow item={n} />
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const format = useFormatter();
  // "16 minutes ago" needs an explicit "now" (next-intl warns otherwise); refreshed every minute while open.
  const now = useNow({ updateInterval: 60_000 });
  const Icon = ICONS[item.icon ?? "bell"];
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ivory-100/5">
        <Icon aria-hidden="true" className="size-4 text-ivory-300" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("text-sm text-pretty", item.unread ? "text-ivory-100" : "text-ivory-300")}>
          {item.message}
        </span>
        <span className="text-xs text-ivory-500">
          {item.at ? `${item.category} · ${format.relativeTime(item.at, now)}` : item.category}
        </span>
      </span>
      {item.unread && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-400" />}
    </>
  );
  const row = "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left";
  return item.href ? (
    <Popover.Close asChild>
      <Link href={item.href} className={cn(row, "transition-colors hover:bg-ivory-100/5")}>
        {body}
      </Link>
    </Popover.Close>
  ) : (
    <div className={row}>{body}</div>
  );
}
