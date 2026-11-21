import { describe, expect, it } from "vitest";
import { decideDownload, DOWNLOAD_HOURLY_CAP, DEFAULT_EXTRA_DOWNLOADS, FREE_DOWNLOADS_PER_PACK, freeDownloadsLeft, type DownloadInput } from "@backend/lib/download/rules";
import { safeFilename, signFileToken, verifyFileToken } from "@backend/storage/file-token";

const SECRET = "test-secret-that-is-long-enough-123456";
const KEY = "products/demo-pack/1.0.0/demo-pack-demo-readme.txt";

describe("file token (local signed download URL)", () => {
  it("round-trips a fresh token", () => {
    const now = Date.UTC(2026, 10, 14, 12);
    const token = signFileToken(KEY, "demo-pack.txt", SECRET, now);
    expect(verifyFileToken(token, SECRET, now + 5_000)).toMatchObject({ k: KEY, f: "demo-pack.txt" });
  });

  it("expires after ~60 seconds", () => {
    const now = Date.UTC(2026, 10, 14, 12);
    const token = signFileToken(KEY, "a.txt", SECRET, now);
    expect(verifyFileToken(token, SECRET, now + 59_000)).not.toBeNull();
    expect(verifyFileToken(token, SECRET, now + 61_000)).toBeNull();
  });

  it("rejects another secret, a tampered payload or signature, and junk", () => {
    const now = Date.now();
    const token = signFileToken(KEY, "a.txt", SECRET, now);
    expect(verifyFileToken(token, "another-secret-that-is-long-enough", now)).toBeNull();

    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ k: "products/other/1.0.0/paid.zip", f: "x", e: 9_999_999_999 })).toString("base64url");
    expect(verifyFileToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifyFileToken(`${body}.${sig.slice(0, -2)}AA`, SECRET, now)).toBeNull();

    for (const junk of [undefined, 42, "", ".", "a.b.c", "../../etc/passwd", "x".repeat(5000)]) {
      expect(verifyFileToken(junk, SECRET, now)).toBeNull();
    }
  });

  it("refuses to sign unsafe keys and needs a secret", () => {
    expect(() => signFileToken("../.env", "a", SECRET)).toThrow();
    expect(() => signFileToken(KEY, "a", undefined)).toThrow();
    expect(() => verifyFileToken("a.b", "")).toThrow();
  });

  it("cleans the save-as filename", () => {
    expect(safeFilename('../../evil"\r\nname.txt')).toBe("_.._evil___name.txt");
    expect(safeFilename("...")).toBe("download");
    expect(safeFilename("Bộ Tiên Hiệp.zip")).toBe("Bộ Tiên Hiệp.zip");
  });
});

const published = { status: "PUBLISHED" as const };
const base: DownloadInput = {
  product: { ...published, type: "FREE" },
  hasFile: true,
  signedIn: true,
  entitlement: null,
  recentDownloads: 0,
  packDownloads: 0,
  extraDownloads: 0,
};
const premium: DownloadInput = { ...base, product: { ...published, type: "PREMIUM" }, entitlement: { revoked: false } };

describe("decideDownload (CLAUDE.md §5, §7)", () => {
  it("nobody downloads a missing, hidden or draft pack, or one without a file", () => {
    for (const status of ["HIDDEN", "DRAFT"] as const) {
      for (const type of ["FREE", "PREMIUM"] as const) {
        expect(decideDownload({ ...base, product: { status, type }, entitlement: { revoked: false } })).toEqual({ ok: false, reason: "notFound" });
      }
    }
    expect(decideDownload({ ...base, product: null })).toEqual({ ok: false, reason: "notFound" });
    expect(decideDownload({ ...base, hasFile: false })).toEqual({ ok: false, reason: "notFound" });
  });

  it("guests download nothing — Free included", () => {
    expect(decideDownload({ ...base, signedIn: false })).toEqual({ ok: false, reason: "signInRequired" });
    expect(decideDownload({ ...premium, signedIn: false })).toEqual({ ok: false, reason: "signInRequired" });
  });

  it("Premium: no / revoked entitlement → refused; owner → unlimited (no quota)", () => {
    expect(decideDownload({ ...premium, entitlement: null })).toEqual({ ok: false, reason: "notOwned" });
    expect(decideDownload({ ...premium, entitlement: { revoked: true } })).toEqual({ ok: false, reason: "notOwned" });
    expect(decideDownload(premium)).toEqual({ ok: true, claim: false, inLibrary: true, quota: null });
    expect(decideDownload({ ...premium, packDownloads: 1_000 })).toEqual({ ok: true, claim: false, inLibrary: true, quota: null });
  });

  it(`Free: ${FREE_DOWNLOADS_PER_PACK} downloads per account and pack, for life; the first one claims the pack`, () => {
    expect(FREE_DOWNLOADS_PER_PACK).toBe(2);
    expect(decideDownload(base)).toEqual({ ok: true, claim: true, inLibrary: true, quota: 2 });
    expect(decideDownload({ ...base, entitlement: { revoked: false }, packDownloads: 1 })).toEqual({ ok: true, claim: false, inLibrary: true, quota: 2 });
    expect(decideDownload({ ...base, entitlement: { revoked: false }, packDownloads: 2 })).toEqual({ ok: false, reason: "quotaExhausted" });
    expect(decideDownload({ ...base, entitlement: { revoked: false }, packDownloads: 7 })).toEqual({ ok: false, reason: "quotaExhausted" });
  });

  it("Free: bought extra downloads raise the quota (step 4.6)", () => {
    expect(DEFAULT_EXTRA_DOWNLOADS).toEqual({ count: 2, priceVnd: 10_000 });
    const extra = { ...base, entitlement: { revoked: false }, packDownloads: 2, extraDownloads: DEFAULT_EXTRA_DOWNLOADS.count };
    expect(decideDownload(extra)).toEqual({ ok: true, claim: false, inLibrary: true, quota: 4 });
    expect(decideDownload({ ...extra, packDownloads: 4 })).toEqual({ ok: false, reason: "quotaExhausted" });
    expect(freeDownloadsLeft(0, 0)).toBe(2);
    expect(freeDownloadsLeft(3, 0)).toBe(0);
    expect(freeDownloadsLeft(3, 2)).toBe(1);
  });

  it("Free: a revoked claim is not re-created; the downloads left stay usable", () => {
    expect(decideDownload({ ...base, entitlement: { revoked: true }, packDownloads: 1 })).toEqual({ ok: true, claim: false, inLibrary: false, quota: 2 });
    expect(decideDownload({ ...base, entitlement: { revoked: true }, packDownloads: 2 })).toEqual({ ok: false, reason: "quotaExhausted" });
  });

  it(`anti-bot cap: ${DOWNLOAD_HOURLY_CAP} downloads an hour per account, any pack`, () => {
    expect(decideDownload({ ...premium, recentDownloads: DOWNLOAD_HOURLY_CAP - 1 }).ok).toBe(true);
    expect(decideDownload({ ...premium, recentDownloads: DOWNLOAD_HOURLY_CAP })).toEqual({ ok: false, reason: "rateLimited" });
    expect(decideDownload({ ...base, recentDownloads: DOWNLOAD_HOURLY_CAP })).toEqual({ ok: false, reason: "rateLimited" });
  });
});
