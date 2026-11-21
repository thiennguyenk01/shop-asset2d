/**
 * The shop's information pages (user choice 2026-11-22): About and FAQ in the menu's "Support" group, the three
 * legal pages as small links under the copyright line (DECISIONS #20 keeps the "Legal" group out of the menu).
 * Texts: `info.<page>` in frontend/messages/<locale>.json, written as samples for the owner to edit.
 */
export const INFO_PAGES = ["about", "faq", "terms", "privacy", "refund"] as const;
export type InfoPage = (typeof INFO_PAGES)[number];

export const LEGAL_PAGES = ["terms", "privacy", "refund"] as const satisfies readonly InfoPage[];

/** A text block: paragraphs separated by a blank line; a paragraph whose lines all start with "- " is a list. */
export type TextBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function textBlocks(body: string): TextBlock[] {
  return body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split("\n").map((l) => l.trim());
      return lines.every((l) => l.startsWith("- "))
        ? { kind: "ul" as const, items: lines.map((l) => l.slice(2).trim()) }
        : { kind: "p" as const, text: lines.join(" ") };
    });
}
