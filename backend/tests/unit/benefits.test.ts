import { describe, expect, it } from "vitest";
import { packBenefits } from "@backend/lib/catalog/benefits";

describe("packBenefits", () => {
  it("free pack: download and personal games only", () => {
    expect(packBenefits({ modification: false, commercial: false, multiProject: false })).toEqual([
      { key: "download", included: true },
      { key: "customize", included: false },
      { key: "personal", included: true },
      { key: "commercial", included: false },
      { key: "multiProject", included: false },
    ]);
  });

  it("premium pack: every benefit", () => {
    expect(packBenefits({ modification: true, commercial: true, multiProject: true }).every((b) => b.included)).toBe(true);
  });
});
