/**
 * Ready-made choices for a pack's technical specs (user request 2026-11-21: pick them like genres / styles instead
 * of typing, "vì tôi lười tìm hiểu kích thước, phần mềm, định dạng"). The values are technical names shown as they
 * are in every language (like file names); only the group titles are translated (`adminProducts.specGroups.*`).
 *
 * Values already saved that are not in these lists (older packs, seed data) are kept: the form shows them as
 * extra chosen chips (`extraValues`), so saving never drops them.
 */
export type SpecGroup = { id: string; options: readonly string[] };

export const RESOLUTION_GROUPS: readonly SpecGroup[] = [
  { id: "sprite", options: ["16×16 px", "24×24 px", "32×32 px", "48×48 px", "64×64 px", "96×96 px", "128×128 px", "256×256 px", "512×512 px"] },
  { id: "screen", options: ["1280×720 (HD)", "1920×1080 (Full HD)", "2560×1440 (2K)", "3840×2160 (4K)"] },
  { id: "special", options: ["Vector (SVG)", "9-slice"] },
  { id: "audio", options: ["44.1 kHz · 16-bit", "48 kHz · 16-bit", "48 kHz · 24-bit", "96 kHz · 24-bit"] },
];

export const SOFTWARE_GROUPS: readonly SpecGroup[] = [
  {
    id: "engine",
    options: ["Unity", "Godot", "GameMaker", "Unreal Engine", "RPG Maker MZ", "RPG Maker MV", "Construct 3", "Cocos Creator", "Defold", "Phaser"],
  },
  { id: "art", options: ["Aseprite", "Photoshop", "Krita", "GIMP", "Pyxel Edit", "Figma"] },
  { id: "map", options: ["Tiled", "LDtk"] },
  { id: "animation", options: ["Spine", "DragonBones"] },
  { id: "sound", options: ["FMOD", "Wwise", "Audacity"] },
];

export const FILE_FORMAT_GROUPS: readonly SpecGroup[] = [
  { id: "image", options: ["PNG", "JPG", "GIF", "WEBP", "SVG"] },
  { id: "source", options: ["PSD", "ASEPRITE", "KRA"] },
  { id: "data", options: ["JSON", "XML", "ATLAS", "TMX", "TSX", "LDTK"] },
  { id: "audio", options: ["WAV", "OGG", "MP3", "FLAC"] },
  { id: "font", options: ["TTF", "OTF", "WOFF2", "FNT"] },
  { id: "video", options: ["MP4", "WEBM"] },
];

const key = (v: string) => v.trim().toLowerCase();

/** The list's own spelling of a saved value ("Aseprite" → "ASEPRITE"), or the value itself if it is not listed. */
export function canonical(groups: readonly SpecGroup[], value: string): string {
  const k = key(value);
  for (const g of groups) for (const o of g.options) if (key(o) === k) return o;
  return value.trim();
}

/** Saved values that none of the groups offer, in their saved order (shown as extra chosen chips). */
export function extraValues(groups: readonly SpecGroup[], selected: readonly string[]): string[] {
  const seen = new Set(groups.flatMap((g) => g.options.map(key)));
  const out: string[] = [];
  for (const v of selected.map((x) => x.trim())) {
    if (!v || seen.has(key(v))) continue;
    seen.add(key(v));
    out.push(v);
  }
  return out;
}

/** The resolution column is one text: chosen sizes are kept joined with ", " (and split back on ","). */
export const RESOLUTION_SEPARATOR = ", ";
export function splitResolution(saved: string | null | undefined): string[] {
  return (saved ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
