"use client";

import { LifeBuoy, MessageCircle, MessageCircleMore, MessagesSquare, Phone, Send, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useState } from "react";
import { overlayPanel } from "@/components/ui/overlay-styles";
import { Link } from "@backend/i18n/navigation";
import { CONTACT_CHANNELS, type ContactChannel } from "@/lib/contact-channels";
import { cn } from "@/lib/cn";

const ICONS: Record<ContactChannel["icon"], LucideIcon> = {
  messenger: MessageCircleMore,
  zalo: MessagesSquare,
  phone: Phone,
  lifebuoy: LifeBuoy,
  telegram: Send,
};

/**
 * "Contact" as a floating chat button (user request, design ref = their screenshot): round button bottom-right,
 * opens a popover listing the contact channels — round brand-coloured icon, name, one-line description,
 * rows separated by hairlines. Sits above the mobile tab bar and the product section bar
 * (--tabbar-h + --bottom-bar-height). Channels without a link yet are shown disabled ("coming soon").
 */
export function ContactChat() {
  const t = useTranslations("contactChat");
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        data-testid="contact-chat"
        aria-label={open ? t("close") : t("open")}
        title={open ? t("close") : t("open")}
        className="fixed right-4 bottom-[calc(var(--tabbar-h,0px)+var(--bottom-bar-height,0px)+1rem)] z-50 grid size-12 cursor-pointer place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-soot shadow-panel [background-color:var(--color-gold-500)] transition-colors hover:from-gold-300 hover:to-gold-500 sm:right-6 sm:size-14"
      >
        {open ? <X aria-hidden="true" className="size-6" /> : <MessageCircle aria-hidden="true" className="size-6" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          aria-label={t("title")}
          data-testid="contact-chat-panel"
          className={cn(overlayPanel, "w-80 max-w-[calc(100vw-2rem)] p-1")}
        >
          <ul className="flex flex-col divide-y divide-bronze-700">
            {CONTACT_CHANNELS.map((c) => (
              <li key={c.key} className="py-1 first:pt-0 last:pb-0">
                <ChannelRow channel={c} name={t(`channels.${c.key}.name`)} description={t(`channels.${c.key}.description`)} soon={t("comingSoon")} onPick={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChannelRow({
  channel,
  name,
  description,
  soon,
  onPick,
}: {
  channel: ContactChannel;
  name: string;
  description: string;
  soon: string;
  onPick: () => void;
}) {
  const Icon = ICONS[channel.icon];
  const body = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-white", channel.color, !channel.href && "opacity-50")}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-ivory-100">{name}</span>
        <span className="text-xs text-pretty text-ivory-500">{description}</span>
      </span>
      {!channel.href && <span className="shrink-0 rounded-full bg-ivory-100/5 px-2 py-0.5 text-xs text-ivory-500">{soon}</span>}
    </>
  );
  const row = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left";

  if (!channel.href) {
    return (
      <div aria-disabled="true" className={cn(row, "cursor-not-allowed")}>
        {body}
      </div>
    );
  }
  if (channel.internal) {
    return (
      <Link href={channel.href} onClick={onPick} className={cn(row, "transition-colors hover:bg-ivory-100/5")}>
        {body}
      </Link>
    );
  }
  return (
    <a
      href={channel.href}
      onClick={onPick}
      target={channel.href.startsWith("tel:") ? undefined : "_blank"}
      rel="noopener noreferrer"
      className={cn(row, "transition-colors hover:bg-ivory-100/5")}
    >
      {body}
    </a>
  );
}
