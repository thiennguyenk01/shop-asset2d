import type { Locale } from "@backend/i18n/routing";

/**
 * "What's new" of a pack version (user choice 2026-11-26). The Admin writes the note in one language or more
 * (`ProductVersion.changelog` = { vi, en, zh }); a language not written shows another one, in the same order as
 * the pack's other texts fall back: the language being read, then Vietnamese, English, Chinese.
 */
const FALLBACK: readonly Locale[] = ["vi", "en", "zh"];

export function changelogText(changelog: unknown, locale: Locale): string | null {
  if (!changelog || typeof changelog !== "object" || Array.isArray(changelog)) return null;
  const notes = changelog as Record<string, unknown>;
  for (const l of [locale, ...FALLBACK.filter((x) => x !== locale)]) {
    const v = notes[l];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * The library flags a pack whose current version went out after the owner's last download of it. A pack never
 * downloaded is not flagged (everything is new to that owner), nor is a version not released yet.
 */
export function hasNewVersionSince(releasedAt: Date | null | undefined, lastDownloadedAt: Date | null): boolean {
  return !!releasedAt && !!lastDownloadedAt && releasedAt.getTime() > lastDownloadedAt.getTime();
}
