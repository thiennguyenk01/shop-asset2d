import { describe, expect, it } from "vitest";
import { formatBytes } from "@backend/lib/format";
import { emailWindows, FREE_LIMITS, usageLevel, usagePercent, worstLevel } from "@backend/lib/usage/rules";

/** Admin "Usage": how much of each free allowance is used (user choice 2026-11-22). */
describe("free plan usage", () => {
  it("warns from 80 % and turns red from 95 %", () => {
    expect(usageLevel(0, 100)).toBe("ok");
    expect(usageLevel(79, 100)).toBe("ok");
    expect(usageLevel(80, 100)).toBe("warn");
    expect(usageLevel(94, 100)).toBe("warn");
    expect(usageLevel(95, 100)).toBe("critical");
    expect(usageLevel(250, 100)).toBe("critical");
    expect(usagePercent(1, 3)).toBe(33);
    expect(usagePercent(5, 0)).toBe(0);
  });

  it("the overview shows the worst level", () => {
    expect(worstLevel([])).toBe("ok");
    expect(worstLevel(["ok", "warn"])).toBe("warn");
    expect(worstLevel(["warn", "critical", "ok"])).toBe("critical");
  });

  it("allowances as the providers state them (checked 2026-11-22)", () => {
    expect(FREE_LIMITS.database.limit).toBe(1e9);
    expect(FREE_LIMITS.storage.limit).toBe(10e9);
    expect(FREE_LIMITS.emailDay.limit).toBe(100);
    expect(FREE_LIMITS.emailMonth.limit).toBe(3000);
  });

  it("mails are counted over the last 24 hours and since the start of the UTC month", () => {
    const w = emailWindows(new Date("2026-11-22T05:30:00Z"));
    expect(w.day.toISOString()).toBe("2026-11-21T05:30:00.000Z");
    expect(w.month.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("sizes in decimal units, in the shop's languages", () => {
    expect(formatBytes(1_234_567_890, "en")).toBe("1.23 GB");
    expect(formatBytes(350_000_000, "en")).toBe("350 MB");
    expect(formatBytes(12_300, "en")).toBe("12.3 kB");
    expect(formatBytes(512, "en")).toBe("512 byte");
    expect(formatBytes(1_500_000, "vi")).toBe("1,5 MB");
  });
});
