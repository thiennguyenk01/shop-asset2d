import { describe, expect, it } from "vitest";
import {
  ADMIN_NOTE_MAX,
  ADMIN_USER_DETAIL_PAGE_SIZE,
  ADMIN_USER_SEARCH_MAX,
  clampPage,
  giftBlock,
  lockBlock,
  parseAdminUserFilters,
  parseLockReason,
  parseNote,
  unlockBlock,
} from "@backend/lib/admin/user-rules";

/** Admin users (GĐ5.5, DECISIONS #34). */
describe("lockBlock / unlockBlock", () => {
  const customer = { id: "u1", role: "USER" as const, status: "ACTIVE" as const };

  it("only an active ordinary account can be locked — never an Admin, never oneself", () => {
    expect(lockBlock(customer, "admin")).toBeNull();
    expect(lockBlock({ ...customer, role: "ADMIN" }, "admin")).toBe("isAdmin");
    expect(lockBlock({ ...customer, id: "admin", role: "ADMIN" }, "admin")).toBe("self");
    expect(lockBlock({ ...customer, status: "LOCKED" }, "admin")).toBe("alreadyLocked");
  });

  it("only a locked account can be unlocked", () => {
    expect(unlockBlock({ status: "LOCKED" })).toBeNull();
    expect(unlockBlock({ status: "ACTIVE" })).toBe("notLocked");
  });
});

describe("giftBlock", () => {
  it("gifts a Premium pack on sale that the customer does not own", () => {
    expect(giftBlock({ type: "PREMIUM", status: "PUBLISHED" }, false)).toBeNull();
    expect(giftBlock(null, false)).toBe("notFound");
    expect(giftBlock({ type: "FREE", status: "PUBLISHED" }, false)).toBe("notPremium");
    expect(giftBlock({ type: "PREMIUM", status: "HIDDEN" }, false)).toBe("notPublished");
    expect(giftBlock({ type: "PREMIUM", status: "DRAFT" }, false)).toBe("notPublished");
    expect(giftBlock({ type: "PREMIUM", status: "PUBLISHED" }, true)).toBe("alreadyOwned");
  });
});

describe("parseLockReason / parseNote", () => {
  it("a lock needs a reason; a note is optional; both are trimmed and capped", () => {
    expect(parseLockReason("  Spam  ")).toEqual({ ok: true, text: "Spam" });
    expect(parseLockReason(" ")).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseLockReason(undefined)).toEqual({ ok: false, error: "reasonRequired" });
    expect(parseLockReason("a".repeat(ADMIN_NOTE_MAX + 1))).toEqual({ ok: false, error: "tooLong" });
    expect(parseNote("")).toEqual({ ok: true, text: null });
    expect(parseNote(null)).toEqual({ ok: true, text: null });
    expect(parseNote(" Quà sinh nhật ")).toEqual({ ok: true, text: "Quà sinh nhật" });
    expect(parseNote("a".repeat(ADMIN_NOTE_MAX + 1))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("parseAdminUserFilters", () => {
  it("keeps known roles and statuses, trims and caps the search, clamps the page", () => {
    expect(parseAdminUserFilters({})).toEqual({ q: "", role: undefined, status: undefined, page: 1 });
    expect(parseAdminUserFilters({ q: " lam ", role: "ADMIN", status: "LOCKED", page: "2" })).toEqual({
      q: "lam",
      role: "ADMIN",
      status: "LOCKED",
      page: 2,
    });
    expect(parseAdminUserFilters({ role: "admin", status: "BANNED" })).toMatchObject({
      role: undefined,
      status: undefined,
    });
    for (const page of ["0", "-3", "x", "2.5"]) expect(parseAdminUserFilters({ page }).page).toBe(1);
    expect(parseAdminUserFilters({ q: "x".repeat(300) }).q).toHaveLength(ADMIN_USER_SEARCH_MAX);
  });
});

describe("clampPage (one account: orders and library, 5 per page)", () => {
  it("reads the page from the URL and keeps it within the pages there are", () => {
    expect(ADMIN_USER_DETAIL_PAGE_SIZE).toBe(5);
    expect(clampPage(undefined, 12, 5)).toEqual({ page: 1, pageCount: 3 });
    expect(clampPage("2", 12, 5)).toEqual({ page: 2, pageCount: 3 });
    expect(clampPage("9", 12, 5)).toEqual({ page: 3, pageCount: 3 }); // past the end → last page
    expect(clampPage("3", 10, 5)).toEqual({ page: 2, pageCount: 2 }); // the last row of page 3 was taken back
    for (const raw of ["0", "-1", "abc", "1.5", "", "9999999"]) expect(clampPage(raw, 12, 5).page).toBe(1);
    expect(clampPage("4", 0, 5)).toEqual({ page: 1, pageCount: 1 }); // nothing yet
  });
});
