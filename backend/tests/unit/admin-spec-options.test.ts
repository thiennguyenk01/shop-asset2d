import { describe, expect, it } from "vitest";
import {
  FILE_FORMAT_GROUPS,
  RESOLUTION_GROUPS,
  RESOLUTION_SEPARATOR,
  SOFTWARE_GROUPS,
  canonical,
  extraValues,
  splitResolution,
} from "@backend/lib/admin/spec-options";

const ALL = { resolution: RESOLUTION_GROUPS, software: SOFTWARE_GROUPS, formats: FILE_FORMAT_GROUPS };

describe("ready-made spec chips (2026-11-21)", () => {
  it.each(Object.entries(ALL))("%s: no duplicate, no comma (a comma would split a value on save), at most 60 chars", (_, groups) => {
    const values = groups.flatMap((g) => g.options);
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(values.length);
    for (const v of values) {
      expect(v).not.toContain(",");
      expect(v.length).toBeLessThanOrEqual(60);
    }
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it("file formats are upper-case, like the section form saves them", () => {
    for (const v of FILE_FORMAT_GROUPS.flatMap((g) => g.options)) expect(v).toBe(v.toUpperCase());
  });

  it("canonical: the list's spelling, else the value as typed", () => {
    expect(canonical(SOFTWARE_GROUPS, " unity ")).toBe("Unity");
    expect(canonical(FILE_FORMAT_GROUPS, "Aseprite")).toBe("ASEPRITE");
    expect(canonical(SOFTWARE_GROUPS, "Phần mềm riêng")).toBe("Phần mềm riêng");
  });

  it("extraValues: saved values that no chip offers, kept in order", () => {
    expect(extraValues(SOFTWARE_GROUPS, ["Unity", "Wwise", "Engine riêng", "engine riêng", ""])).toEqual(["Engine riêng"]);
    expect(extraValues(FILE_FORMAT_GROUPS, ["png", "Aseprite"])).toEqual([]);
  });

  it("resolution text round-trips through the chips", () => {
    expect(splitResolution(null)).toEqual([]);
    expect(splitResolution("32×32 px, 64×64 px")).toEqual(["32×32 px", "64×64 px"]);
    expect(splitResolution(["32×32 px", "64×64 px"].join(RESOLUTION_SEPARATOR))).toEqual(["32×32 px", "64×64 px"]);
    // Older free text stays one chip (no comma in it).
    expect(splitResolution("64×64 px / frame")).toEqual(["64×64 px / frame"]);
  });
});
