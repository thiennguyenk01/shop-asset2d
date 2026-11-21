/**
 * Contact channels shown in the floating chat button (layout/contact-chat.tsx).
 *
 * ⚠️ Fill in the real links before launch. An empty `href` renders the row as "coming soon" (disabled) —
 * never put a made-up phone number or page here (CLAUDE.md: no fake data presented as real).
 *   messenger: "https://m.me/<page-username>"
 *   zalo:      "https://zalo.me/<phone-or-oa-id>"
 *   hotline:   "tel:+84xxxxxxxxx"
 *   telegram:  "https://t.me/<channel>"
 * `support` is an in-app route (the support / contact form page, built in a later phase).
 */
export type ContactChannelKey = "messenger" | "zalo" | "hotline" | "support" | "telegram";

export type ContactChannel = {
  key: ContactChannelKey;
  href: string;
  /** In-app route (localized Link) vs external URL (new tab) / tel: link. */
  internal?: boolean;
  /** Icon name in contact-chat.tsx and the channel's own brand colour for the round icon. */
  icon: "messenger" | "zalo" | "phone" | "lifebuoy" | "telegram";
  color: string;
};

export const CONTACT_CHANNELS: ContactChannel[] = [
  { key: "messenger", href: "", icon: "messenger", color: "bg-gradient-to-br from-[#00b2ff] to-[#a334fa]" },
  { key: "zalo", href: "", icon: "zalo", color: "bg-[#0068ff]" },
  { key: "hotline", href: "", icon: "phone", color: "bg-[#22c55e]" },
  { key: "support", href: "/contact", internal: true, icon: "lifebuoy", color: "bg-gradient-to-b from-gold-400 to-gold-600" },
  { key: "telegram", href: "", icon: "telegram", color: "bg-[#229ed9]" },
];
