import { describe, expect, it } from "vitest";
import { changelogText, hasNewVersionSince } from "@backend/lib/catalog/changelog";

/** "What's new" of a pack version (user choice 2026-11-26). */
describe("changelogText", () => {
  it("reads the note in the language being read", () => {
    const log = { vi: "Thêm hoạt ảnh.", en: "Added animations.", zh: "新增动画。" };
    expect(changelogText(log, "vi")).toBe("Thêm hoạt ảnh.");
    expect(changelogText(log, "en")).toBe("Added animations.");
    expect(changelogText(log, "zh")).toBe("新增动画。");
  });

  it("falls back to Vietnamese, then English, then Chinese when that language is not written", () => {
    expect(changelogText({ vi: "Bản đầu.", en: "", zh: "首次" }, "en")).toBe("Bản đầu.");
    expect(changelogText({ vi: "  ", en: "First.", zh: "首次" }, "zh")).toBe("首次");
    expect(changelogText({ en: "First." }, "zh")).toBe("First.");
    expect(changelogText({ zh: "首次" }, "vi")).toBe("首次");
  });

  it("trims the note; nothing written, or not a note object, gives null", () => {
    expect(changelogText({ vi: "  Sửa lỗi.\n" }, "vi")).toBe("Sửa lỗi.");
    expect(changelogText({ vi: "", en: " ", zh: "" }, "vi")).toBeNull();
    expect(changelogText(null, "vi")).toBeNull();
    expect(changelogText("Sửa lỗi", "vi")).toBeNull();
    expect(changelogText(["Sửa lỗi"], "vi")).toBeNull();
    expect(changelogText({ vi: 3 }, "vi")).toBeNull();
  });
});

describe("hasNewVersionSince", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 10, d));
  it("flags a version released after the owner's last download", () => {
    expect(hasNewVersionSince(day(20), day(10))).toBe(true);
  });
  it("does not flag a version the owner already downloaded after its release", () => {
    expect(hasNewVersionSince(day(10), day(20))).toBe(false);
    expect(hasNewVersionSince(day(10), day(10))).toBe(false);
  });
  it("does not flag a pack never downloaded, nor a version not released", () => {
    expect(hasNewVersionSince(day(20), null)).toBe(false);
    expect(hasNewVersionSince(null, day(10))).toBe(false);
    expect(hasNewVersionSince(undefined, day(10))).toBe(false);
  });
});
