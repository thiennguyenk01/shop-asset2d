import { describe, expect, it } from "vitest";
import {
  contactLink,
  CONTACT_INPUT_MAX,
  CONTACT_KINDS,
  formatHotline,
  normalizeContactValue,
  parseContactForm,
  readContactSettings,
  sameContactSettings,
  visibleContacts,
} from "@backend/lib/contact/channels";

/** Contact channels of the chat button (user choice 2026-11-26). */
const ok = (value: string) => ({ ok: true, value });
const bad = { ok: false, error: "invalid" };

describe("normalizeContactValue", () => {
  it("empty means not filled", () => {
    for (const k of CONTACT_KINDS) expect(normalizeContactValue(k, "  ")).toEqual(ok(""));
    expect(normalizeContactValue("email", undefined)).toEqual(ok(""));
  });

  it("messenger: page name, numeric id, or a pasted link", () => {
    expect(normalizeContactValue("messenger", "assetgame2d")).toEqual(ok("assetgame2d"));
    expect(normalizeContactValue("messenger", "https://www.facebook.com/asset.game2d/")).toEqual(ok("asset.game2d"));
    expect(normalizeContactValue("messenger", "m.me/assetgame2d?ref=x")).toEqual(ok("assetgame2d"));
    expect(normalizeContactValue("messenger", "https://facebook.com/profile.php?id=1000123456")).toEqual(
      ok("1000123456"),
    );
    expect(normalizeContactValue("messenger", "https://facebook.com/profile.php")).toEqual(bad);
    expect(normalizeContactValue("messenger", "abc")).toEqual(bad);
    expect(normalizeContactValue("messenger", "ten trang")).toEqual(bad);
    expect(normalizeContactValue("messenger", "https://evil.example/assetgame2d")).toEqual(bad);
  });

  it("zalo: digits, +84 becomes 0, zalo.me link", () => {
    expect(normalizeContactValue("zalo", "+84 912 345 678")).toEqual(ok("0912345678"));
    expect(normalizeContactValue("zalo", "https://zalo.me/0912345678")).toEqual(ok("0912345678"));
    expect(normalizeContactValue("zalo", "0912-345-678")).toEqual(ok("0912345678"));
    expect(normalizeContactValue("zalo", "zalo-shop")).toEqual(bad);
  });

  it("hotline: Vietnamese numbers only", () => {
    expect(normalizeContactValue("hotline", "0912 345 678")).toEqual(ok("0912345678"));
    expect(normalizeContactValue("hotline", "+84 24 3812 3456")).toEqual(ok("02438123456"));
    expect(normalizeContactValue("hotline", "1900.1234")).toEqual(ok("19001234"));
    expect(normalizeContactValue("hotline", "tel:0912345678")).toEqual(ok("0912345678"));
    expect(normalizeContactValue("hotline", "12345")).toEqual(bad);
    expect(normalizeContactValue("hotline", "0912 345 67a")).toEqual(bad);
  });

  it("telegram: username, @name or t.me link", () => {
    expect(normalizeContactValue("telegram", "@asset_game2d")).toEqual(ok("asset_game2d"));
    expect(normalizeContactValue("telegram", "https://t.me/asset_game2d")).toEqual(ok("asset_game2d"));
    expect(normalizeContactValue("telegram", "ab")).toEqual(bad);
    expect(normalizeContactValue("telegram", "1abcde")).toEqual(bad);
  });

  it("email: one address, lower-cased", () => {
    expect(normalizeContactValue("email", " HoTro@Example.com ")).toEqual(ok("hotro@example.com"));
    expect(normalizeContactValue("email", "mailto:a@b.co")).toEqual(ok("a@b.co"));
    expect(normalizeContactValue("email", "a@b")).toEqual(bad);
    expect(normalizeContactValue("email", "a@b.co, c@d.co")).toEqual(bad);
  });

  it("too long is its own error", () => {
    expect(normalizeContactValue("email", "a".repeat(CONTACT_INPUT_MAX + 1))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("contactLink", () => {
  it("the shop builds every link itself", () => {
    expect(contactLink("messenger", "assetgame2d")).toEqual({ kind: "messenger", href: "https://m.me/assetgame2d" });
    expect(contactLink("zalo", "0912345678")).toEqual({ kind: "zalo", href: "https://zalo.me/0912345678" });
    expect(contactLink("hotline", "0912345678")).toEqual({
      kind: "hotline",
      href: "tel:+84912345678",
      display: "0912 345 678",
    });
    expect(contactLink("hotline", "19001234")).toEqual({ kind: "hotline", href: "tel:19001234", display: "1900 1234" });
    expect(contactLink("telegram", "asset_game2d")).toEqual({ kind: "telegram", href: "https://t.me/asset_game2d" });
    expect(contactLink("email", "a@b.co")).toEqual({ kind: "email", href: "mailto:a@b.co", display: "a@b.co" });
    expect(formatHotline("02438123456")).toBe("024 3812 3456");
  });
});

describe("readContactSettings / visibleContacts", () => {
  it("nothing stored: every channel, empty and on; nothing visible", () => {
    const all = readContactSettings(null);
    expect(all.map((c) => c.kind)).toEqual([...CONTACT_KINDS]);
    expect(all.every((c) => c.value === "" && c.enabled)).toBe(true);
    expect(visibleContacts(all)).toEqual([]);
  });

  it("keeps the saved order, adds missing channels, ignores junk and values that no longer pass", () => {
    const all = readContactSettings([
      { kind: "email", value: "a@b.co", enabled: true },
      { kind: "zalo", value: "0912345678", enabled: false },
      { kind: "email", value: "x@y.co", enabled: true },
      { kind: "fax", value: "123" },
      "junk",
      { kind: "telegram", value: "javascript:alert(1)", enabled: true },
    ]);
    expect(all.map((c) => c.kind)).toEqual(["email", "zalo", "telegram", "messenger", "hotline"]);
    expect(all[0]).toEqual({ kind: "email", value: "a@b.co", enabled: true });
    expect(all[2]!.value).toBe("");
    expect(visibleContacts(all)).toEqual([{ kind: "email", href: "mailto:a@b.co", display: "a@b.co" }]);
  });
});

describe("parseContactForm", () => {
  it("reads the order, fixes it up, normalizes values; errors per channel", () => {
    const r = parseContactForm({
      order: ["email", "zalo", "email", "nope"],
      values: { email: "A@B.co", zalo: "+84912345678" },
      enabled: { email: true, zalo: true },
    });
    expect(r.ok && r.value).toEqual([
      { kind: "email", value: "a@b.co", enabled: true },
      { kind: "zalo", value: "0912345678", enabled: true },
      { kind: "messenger", value: "", enabled: false },
      { kind: "hotline", value: "", enabled: false },
      { kind: "telegram", value: "", enabled: false },
    ]);
    expect(parseContactForm({ order: [], values: { telegram: "ab", hotline: "x".repeat(300) }, enabled: {} })).toEqual({
      ok: false,
      fields: { telegram: "invalid", hotline: "tooLong" },
    });
  });

  it("sameContactSettings compares order, values and switches", () => {
    const a = readContactSettings(null);
    expect(sameContactSettings(a, readContactSettings(null))).toBe(true);
    expect(sameContactSettings(a, [...a].reverse())).toBe(false);
  });
});
