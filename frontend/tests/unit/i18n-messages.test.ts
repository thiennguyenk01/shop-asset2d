import { describe, expect, it } from "vitest";
import { compareMessages, loadMessages } from "../../scripts/i18n-check";

describe("messages/vi.json ↔ messages/en.json", () => {
  it("have identical keys and no empty values", () => {
    expect(compareMessages(loadMessages())).toEqual([]);
  });

  it("detects a missing key and an empty value", () => {
    const problems = compareMessages({
      vi: { a: { b: "x", c: "y" } },
      en: { a: { b: " " } },
    });
    expect(problems).toContain('[en] thiếu key "a.c"');
    expect(problems).toContain('[en] "a.b" đang rỗng');
  });
});

describe("Chinese punctuation guard", () => {
  it("rejects the Chinese double dash, which the body font renders as two dashes", () => {
    expect(compareMessages({ zh: { a: "商店——筛选" } })).toEqual(['[zh] "a" dùng "——" (hãy dùng dấu câu "，。·")']);
  });
});
