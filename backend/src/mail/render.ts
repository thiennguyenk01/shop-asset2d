import { createTranslator } from "next-intl";
import { HTML_LANG, type Locale } from "@backend/i18n/routing";
import en from "../../../frontend/messages/en.json" with { type: "json" };
import vi from "../../../frontend/messages/vi.json" with { type: "json" };
import zh from "../../../frontend/messages/zh.json" with { type: "json" };

/**
 * Mail rendering (GĐ6.1) — pure, unit-tested. Every word comes from `frontend/messages/<locale>.json` (namespace
 * `email`), in the language of the customer (DECISIONS #38): VI / EN / ZH. Every value put into the HTML is
 * escaped; links must be absolute http(s) URLs.
 *
 * Layout: one centred card on the light theme colours of the site (ivory background, antique gold, ink text),
 * table-based with inline styles so it holds in mail clients, plus a plain-text part with the same content.
 */
const MESSAGES = { vi, en, zh } as const;

export type RenderedMail = { subject: string; html: string; text: string };

export type PasswordResetMail = {
  /** Display name of the account, or null (then a neutral greeting). */
  name: string | null;
  email: string;
  /** Absolute link to the reset page, carrying the one-time token. */
  url: string;
  /** How long the link stays valid. */
  minutes: number;
};

export function renderPasswordReset(locale: Locale, p: PasswordResetMail): RenderedMail {
  assertLink(p.url);
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "email" });
  const brand = MESSAGES[locale].brand.name;
  const name = p.name?.trim();
  const subject = t("passwordReset.subject", { brand });
  const greeting = name ? t("passwordReset.greeting", { name }) : t("passwordReset.greetingNoName");
  const lines = {
    intro: t("passwordReset.intro"),
    expiry: t("passwordReset.expiry", { minutes: p.minutes }),
    linkHint: t("passwordReset.linkHint"),
    ignore: t("passwordReset.ignore"),
  };

  const html = layout({
    locale,
    brand,
    subject,
    preheader: t("passwordReset.preheader", { minutes: p.minutes }),
    footer: [t("automated"), t("sentTo", { email: p.email })],
    body: [
      `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:${C.ink};">${esc(t("passwordReset.heading"))}</h1>`,
      paragraph(greeting),
      paragraph(lines.intro),
      button(p.url, t("passwordReset.button")),
      paragraph(lines.expiry, C.muted),
      paragraph(lines.linkHint, C.muted, "14px"),
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${esc(p.url)}" style="color:${C.link};">${esc(p.url)}</a></p>`,
      `<hr style="border:none;border-top:1px solid ${C.border};margin:24px 0 16px;">`,
      paragraph(lines.ignore, C.muted, "14px"),
    ].join("\n"),
  });

  const text = [
    t("passwordReset.heading"),
    "",
    greeting,
    "",
    lines.intro,
    "",
    `${t("passwordReset.button")}: ${p.url}`,
    "",
    lines.expiry,
    "",
    lines.ignore,
    "",
    "—",
    brand,
    t("automated"),
    t("sentTo", { email: p.email }),
    "",
  ].join("\n");

  return { subject, html, text };
}

// ───────────────────────────── shared layout ─────────────────────────────

/** Light theme of the site (DESIGN.md): ivory #F5F0E5, antique gold #B58A35, ink #352B20, border #D9CBB2. */
const C = {
  page: "#F5F0E5",
  card: "#FFFDF8",
  border: "#D9CBB2",
  ink: "#352B20",
  muted: "#6F6150",
  gold: "#B58A35",
  seal: "#A8322A",
  link: "#7A5A12",
} as const;

// Single quotes only: the stack sits inside style="…" attributes.
const FONT = `-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`;

function layout(o: {
  locale: Locale;
  brand: string;
  subject: string;
  preheader: string;
  body: string;
  footer: string[];
}): string {
  return `<!doctype html>
<html lang="${HTML_LANG[o.locale]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:12px;">
<tr><td style="padding:20px 32px;border-bottom:1px solid ${C.border};font-family:${FONT};">
<span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:6px;background:${C.seal};color:#FFF6E6;font-size:18px;font-weight:700;vertical-align:middle;">仙</span>
<span style="display:inline-block;margin-left:10px;vertical-align:middle;font-size:16px;font-weight:600;color:${C.ink};">${esc(o.brand)}</span>
</td></tr>
<tr><td style="padding:32px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};">
${o.body}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 32px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};text-align:center;">
${o.footer.map((l) => esc(l)).join("<br>")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

function paragraph(text: string, color: string = C.ink, size = "15px"): string {
  return `<p style="margin:0 0 16px;font-size:${size};line-height:1.6;color:${color};">${esc(text)}</p>`;
}

/** Gold button with ink text (contrast ≈ 6:1), as a table so Outlook keeps its padding. */
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:${C.gold};">
<a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#1D1710;text-decoration:none;border-radius:8px;">${esc(label)}</a>
</td></tr></table>`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertLink(url: string): void {
  let ok = false;
  try {
    const u = new URL(url);
    ok = u.protocol === "https:" || u.protocol === "http:";
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("Link trong thư phải là URL http(s) đầy đủ.");
}
