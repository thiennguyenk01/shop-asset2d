/**
 * Tabs of the pack editor (2026-11-21), shared by the server page and the client editor. Kept out of
 * `pack-editor.tsx`: values exported from a "use client" file reach a server component as client references.
 */
export const PACK_TABS = ["info", "content", "media", "sections", "versions"] as const;
export type PackTab = (typeof PACK_TABS)[number];
export type CheckState = "ok" | "warn" | "miss";
export type CheckItem = { state: CheckState; text: string; tab: PackTab; key: string };

/** `?tab=` of the URL → a tab (Info when missing or unknown). */
export function packTabFrom(raw: string | string[] | undefined): PackTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PACK_TABS as readonly string[]).includes(v ?? "") ? (v as PackTab) : "info";
}

/** Tabs of the section editor (user request 2026-11-21: tabs, a section may have many pictures). */
export const SECTION_TABS = ["info", "content", "media"] as const;
export type SectionTab = (typeof SECTION_TABS)[number];

/** `?tab=` of the section page → a tab (Info when missing or unknown). */
export function sectionTabFrom(raw: string | string[] | undefined): SectionTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (SECTION_TABS as readonly string[]).includes(v ?? "") ? (v as SectionTab) : "info";
}
