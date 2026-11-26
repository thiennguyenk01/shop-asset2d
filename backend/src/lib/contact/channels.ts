/**
 * Contact channels of the floating chat button (user choice 2026-11-26), pure so they are unit-tested and usable
 * from client components. A fixed set of channels; the Admin only types the page / number / username / address,
 * the shop builds the link itself (no free-form URL), turns a channel on or off and orders them. Channels without a
 * value (or turned off) are not shown; with none to show, the chat button is not shown either.
 */
export const CONTACT_KINDS = ["messenger", "zalo", "hotline", "telegram", "email"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const isContactKind = (v: unknown): v is ContactKind =>
  typeof v === "string" && (CONTACT_KINDS as readonly string[]).includes(v);

/** What the Admin saved for one channel; `value` is already normalized ("" = not filled). */
export type ContactSetting = { kind: ContactKind; value: string; enabled: boolean };
/** A channel the storefront shows. `display` = the number / address written out (hotline, email). */
export type ContactLink = { kind: ContactKind; href: string; display?: string };
export type ContactError = "invalid" | "tooLong";

/** Longest text accepted in a field before reading it (a pasted link included). */
export const CONTACT_INPUT_MAX = 200;

const firstSegment = (path: string) => path.split(/[/?#]/)[0] ?? "";

/** The part after a known host, when a whole link was pasted (https:// and www. optional). */
function afterHost(raw: string, hosts: RegExp): string | null {
  const m = new RegExp(`^(?:https?://)?(?:www\\.|m\\.|web\\.)?(?:${hosts.source})/(.*)$`, "i").exec(raw);
  return m ? firstSegment(m[1]!) : null;
}

const digitsOnly = (s: string) => s.replace(/[\s.\-()]/g, "");

/**
 * Read what the Admin typed for a channel. Empty → `{ ok: true, value: "" }` (channel not filled).
 * - messenger: Facebook page username (letters, digits, dots; 5–50) or numeric page id; a facebook.com / m.me link works.
 * - zalo: phone number or Zalo OA id (digits, 9–20; +84 → 0); a zalo.me link works.
 * - hotline: Vietnamese number: 0 + 9–10 digits, or 1800 / 1900 numbers; +84 → 0.
 * - telegram: username (letter first, then letters / digits / _; 5–32); "@name" or a t.me link works.
 * - email: one address, lower-cased.
 */
export function normalizeContactValue(
  kind: ContactKind,
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: ContactError } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: true, value: "" };
  if (text.length > CONTACT_INPUT_MAX) return { ok: false, error: "tooLong" };
  const bad = { ok: false as const, error: "invalid" as const };
  switch (kind) {
    case "messenger": {
      let v = afterHost(text, /facebook\.com|fb\.com|m\.me|messenger\.com\/t/) ?? text;
      // facebook.com/profile.php?id=<digits>: the page id is in the query.
      if (v.toLowerCase() === "profile.php") v = /[?&]id=(\d{5,20})(?:[&#]|$)/.exec(text)?.[1] ?? "";
      return /^(?:[A-Za-z0-9.]{5,50}|\d{5,20})$/.test(v) && !/^\.|\.$/.test(v) ? { ok: true, value: v } : bad;
    }
    case "zalo": {
      let v = digitsOnly(afterHost(text, /zalo\.me/) ?? text);
      if (v.startsWith("+84")) v = "0" + v.slice(3);
      return /^\d{9,20}$/.test(v) ? { ok: true, value: v } : bad;
    }
    case "hotline": {
      let v = digitsOnly(text.replace(/^tel:/i, ""));
      if (v.startsWith("+84")) v = "0" + v.slice(3);
      return /^(?:0\d{9,10}|1[89]00\d{4,6})$/.test(v) ? { ok: true, value: v } : bad;
    }
    case "telegram": {
      const v = (afterHost(text, /t\.me|telegram\.me/) ?? text).replace(/^@/, "");
      return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v) ? { ok: true, value: v } : bad;
    }
    case "email": {
      const v = text.replace(/^mailto:/i, "").toLowerCase();
      return v.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) ? { ok: true, value: v } : bad;
    }
  }
}

/** A hotline number in groups: 0912 345 678 · 024 3812 3456 · 1900 1234. */
export function formatHotline(v: string): string {
  if (/^0\d{9}$/.test(v)) return `${v.slice(0, 4)} ${v.slice(4, 7)} ${v.slice(7)}`;
  if (/^0\d{10}$/.test(v)) return `${v.slice(0, 3)} ${v.slice(3, 7)} ${v.slice(7)}`;
  return `${v.slice(0, 4)} ${v.slice(4)}`;
}

/** The link a (normalized, non-empty) value opens. */
export function contactLink(kind: ContactKind, value: string): ContactLink {
  switch (kind) {
    case "messenger":
      return { kind, href: `https://m.me/${value}` };
    case "zalo":
      return { kind, href: `https://zalo.me/${value}` };
    case "hotline":
      return {
        kind,
        href: value.startsWith("0") ? `tel:+84${value.slice(1)}` : `tel:${value}`,
        display: formatHotline(value),
      };
    case "telegram":
      return { kind, href: `https://t.me/${value}` };
    case "email":
      return { kind, href: `mailto:${value}`, display: value };
  }
}

/**
 * What is stored (JSON column `ShopSettings.contactChannels`) → every channel once, in the saved order, then the
 * channels never saved (empty, on). Anything malformed is ignored; a stored value that no longer passes the rules
 * counts as empty, so the storefront never builds a link from it.
 */
export function readContactSettings(stored: unknown): ContactSetting[] {
  const out: ContactSetting[] = [];
  const seen = new Set<ContactKind>();
  for (const item of Array.isArray(stored) ? stored : []) {
    if (!item || typeof item !== "object") continue;
    const { kind, value, enabled } = item as Record<string, unknown>;
    if (!isContactKind(kind) || seen.has(kind)) continue;
    seen.add(kind);
    const v = normalizeContactValue(kind, value);
    out.push({ kind, value: v.ok ? v.value : "", enabled: enabled !== false });
  }
  for (const kind of CONTACT_KINDS) if (!seen.has(kind)) out.push({ kind, value: "", enabled: true });
  return out;
}

/** The channels the chat button lists: on and filled, in the saved order. */
export const visibleContacts = (settings: ContactSetting[]): ContactLink[] =>
  settings.filter((s) => s.enabled && s.value).map((s) => contactLink(s.kind, s.value));

/**
 * The Admin form: `order` = the channel keys top to bottom (missing / unknown / repeated ones are fixed up),
 * `values[kind]` = the text typed, `enabled[kind]` = the "show" box.
 */
export function parseContactForm(raw: {
  order: unknown[];
  values: Partial<Record<ContactKind, unknown>>;
  enabled: Partial<Record<ContactKind, boolean>>;
}): { ok: true; value: ContactSetting[] } | { ok: false; fields: Partial<Record<ContactKind, ContactError>> } {
  const order: ContactKind[] = [];
  for (const k of raw.order) if (isContactKind(k) && !order.includes(k)) order.push(k);
  for (const k of CONTACT_KINDS) if (!order.includes(k)) order.push(k);
  const fields: Partial<Record<ContactKind, ContactError>> = {};
  const value: ContactSetting[] = [];
  for (const kind of order) {
    const v = normalizeContactValue(kind, raw.values[kind]);
    if (!v.ok) fields[kind] = v.error;
    else value.push({ kind, value: v.value, enabled: raw.enabled[kind] === true });
  }
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, value };
}

export const sameContactSettings = (a: ContactSetting[], b: ContactSetting[]) =>
  a.length === b.length &&
  a.every((x, i) => x.kind === b[i]!.kind && x.value === b[i]!.value && x.enabled === b[i]!.enabled);
