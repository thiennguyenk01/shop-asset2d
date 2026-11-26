import { Mail, MessageCircleMore, MessagesSquare, Phone, Send, type LucideIcon } from "lucide-react";
import type { ContactKind } from "@backend/lib/contact/channels";
import { cn } from "@/lib/cn";

/** Icon and the channel's own brand colour for the round icon (chat button, Admin → Settings → Contact). */
const STYLE: Record<ContactKind, { Icon: LucideIcon; color: string }> = {
  messenger: { Icon: MessageCircleMore, color: "bg-gradient-to-br from-[#00b2ff] to-[#a334fa]" },
  zalo: { Icon: MessagesSquare, color: "bg-[#0068ff]" },
  hotline: { Icon: Phone, color: "bg-[#22c55e]" },
  telegram: { Icon: Send, color: "bg-[#229ed9]" },
  email: { Icon: Mail, color: "bg-gradient-to-b from-gold-400 to-gold-600" },
};

export function ContactIcon({ kind, className }: { kind: ContactKind; className?: string }) {
  const { Icon, color } = STYLE[kind];
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-white", color, className)}>
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}
