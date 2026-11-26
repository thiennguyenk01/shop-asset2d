"use client";

import { MessageCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useState } from "react";
import { overlayPanel } from "@/components/ui/overlay-styles";
import type { ContactLink } from "@backend/lib/contact/channels";
import { cn } from "@/lib/cn";
import { ContactIcon } from "./contact-icons";

/**
 * "Contact" as a floating chat button (user request, design ref = their screenshot): round button bottom-right,
 * opens a popover listing the contact channels — round brand-coloured icon, name, one-line description,
 * rows separated by hairlines. Sits above the mobile tab bar and the product section bar
 * (--tabbar-h + --bottom-bar-height). The channels are the ones the Admin filled and turned on (Admin → Settings →
 * Contact, user choice 2026-11-26); the shell does not render the button when there are none.
 */
export function ContactChat({ channels }: { channels: ContactLink[] }) {
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
            {channels.map((c) => (
              <li key={c.kind} className="py-1 first:pt-0 last:pb-0">
                <ChannelRow channel={c} name={t(`channels.${c.kind}.name`)} description={t(`channels.${c.kind}.description`)} onPick={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChannelRow({ channel, name, description, onPick }: { channel: ContactLink; name: string; description: string; onPick: () => void }) {
  // tel: and mailto: open the phone / mail app; the others are web pages, opened in a new tab.
  const app = channel.href.startsWith("tel:") || channel.href.startsWith("mailto:");
  return (
    <a
      href={channel.href}
      onClick={onPick}
      target={app ? undefined : "_blank"}
      rel={app ? undefined : "noopener noreferrer"}
      data-testid={`contact-channel-${channel.kind}`}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ivory-100/5"
    >
      <ContactIcon kind={channel.kind} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-ivory-100">{name}</span>
        <span className="text-xs text-pretty text-ivory-500">{description}</span>
        {/* On a computer tel: / mailto: may open nothing: the number / address is written out too. */}
        {channel.display && <span className="text-xs break-all text-gold-300">{channel.display}</span>}
      </span>
    </a>
  );
}
