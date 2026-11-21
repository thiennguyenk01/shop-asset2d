import { describe, expect, it } from "vitest";
import {
  checkNewVersion,
  compareVersions,
  imageSize,
  mediaKindOf,
  planUpload,
  sizeParts,
  sniffFormat,
  suggestNextVersion,
} from "@backend/lib/admin/upload-rules";
import { signUploadTicket, verifyUploadTicket } from "@backend/storage/upload-ticket";

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const png = (w: number, h: number) =>
  bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, "IHDR", (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);

describe("planUpload (GĐ5.3)", () => {
  it("accepts preview media and archives only where they belong", () => {
    expect(planUpload("media", "hero.PNG", 1000)).toMatchObject({ ok: true, format: "png", ext: "png", mime: "image/png" });
    expect(planUpload("media", "a.jpeg", 1000)).toMatchObject({ ok: true, format: "jpeg", ext: "jpg" });
    expect(planUpload("media", "trailer.webm", 1000)).toMatchObject({ ok: true, format: "webm" });
    expect(planUpload("file", "pack-v1.zip", 1000)).toMatchObject({ ok: true, format: "zip", mime: "application/zip" });
    // An archive is not a picture, a picture is not the sellable file.
    expect(planUpload("media", "pack.zip", 1000)).toEqual({ ok: false, error: "badType" });
    expect(planUpload("file", "cover.png", 1000)).toEqual({ ok: false, error: "badType" });
  });

  it("never accepts SVG (scriptable) or unknown / missing extensions", () => {
    for (const name of ["logo.svg", "page.html", "x.exe", "noext", "archive.zip.svg"]) expect(planUpload("media", name, 10)).toEqual({ ok: false, error: "badType" });
  });

  it("checks size limits per format, empty files and names", () => {
    expect(planUpload("media", "a.png", 10 * 1024 * 1024 + 1)).toEqual({ ok: false, error: "tooLarge" });
    expect(planUpload("media", "a.gif", 15 * 1024 * 1024).ok).toBe(true);
    expect(planUpload("media", "a.mp4", 101 * 1024 * 1024)).toEqual({ ok: false, error: "tooLarge" });
    expect(planUpload("file", "a.zip", 2_000_000_001)).toEqual({ ok: false, error: "tooLarge" });
    expect(planUpload("file", "a.zip", 0)).toEqual({ ok: false, error: "empty" });
    expect(planUpload("file", "a.zip", Number.NaN)).toEqual({ ok: false, error: "empty" });
    expect(planUpload("file", "   ", 10)).toEqual({ ok: false, error: "badName" });
    expect(planUpload("file", `${"a".repeat(200)}.zip`, 10)).toEqual({ ok: false, error: "badName" });
  });
});

describe("sniffFormat: the real content, not the name", () => {
  it("recognises every accepted format by its first bytes", () => {
    expect(sniffFormat(png(1, 1))).toBe("png");
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFormat(bytes("GIF89a"))).toBe("gif");
    expect(sniffFormat(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("webp");
    expect(sniffFormat(bytes(0, 0, 0, 0x20, "ftypisom"))).toBe("mp4");
    expect(sniffFormat(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("webm");
    expect(sniffFormat(bytes("PK", 3, 4))).toBe("zip");
    expect(sniffFormat(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c))).toBe("7z");
    expect(sniffFormat(bytes("Rar!", 0x1a, 0x07, 0))).toBe("rar");
  });

  it("rejects an HTML page, an SVG or a program renamed to an accepted name", () => {
    expect(sniffFormat(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffFormat(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffFormat(bytes("MZ", 0x90, 0))).toBeNull();
    expect(sniffFormat(new Uint8Array())).toBeNull();
  });
});

describe("imageSize", () => {
  it("reads PNG, GIF, WebP (VP8X) and JPEG headers", () => {
    expect(imageSize("png", png(640, 360))).toEqual({ width: 640, height: 360 });
    expect(imageSize("gif", bytes("GIF89a", 0x40, 0x01, 0xf0, 0x00))).toEqual({ width: 320, height: 240 });
    // VP8X: canvas width-1 / height-1 as 24-bit little endian at 24 / 27.
    expect(imageSize("webp", bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8X", 10, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0x02, 0, 0x67, 0x01, 0))).toEqual({ width: 640, height: 360 });
    // JPEG: SOI, an APP0 segment, then SOF0 with height 360 / width 640.
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x01, 0x68, 0x02, 0x80, 3);
    expect(imageSize("jpeg", jpeg)).toEqual({ width: 640, height: 360 });
  });

  it("returns null for videos, archives, cut headers and absurd sizes", () => {
    expect(imageSize("mp4", png(1, 1))).toBeNull();
    expect(imageSize("png", png(1, 1).slice(0, 20))).toBeNull();
    expect(imageSize("png", png(0, 10))).toBeNull();
    expect(imageSize("png", png(200_000, 10))).toBeNull();
    expect(imageSize("jpeg", bytes(0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
  });

  it("media kinds follow the format", () => {
    expect([mediaKindOf("png"), mediaKindOf("gif"), mediaKindOf("webm"), mediaKindOf("zip")]).toEqual(["IMAGE", "GIF", "VIDEO", null]);
  });
});

describe("versions", () => {
  it("compares x.y.z numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
    expect(["1.2.0", "1.0.0", "1.10.0"].sort(compareVersions)).toEqual(["1.0.0", "1.2.0", "1.10.0"]);
  });

  it("a new version must be x.y.z and higher than all the others", () => {
    expect(checkNewVersion("1.1.0", ["1.0.0"])).toBeNull();
    expect(checkNewVersion("1.0.0", ["1.0.0"])).toBe("versionNotNewer");
    expect(checkNewVersion("0.9.0", ["1.0.0"])).toBe("versionNotNewer");
    for (const bad of ["1.0", "v1.1.0", "1.01.0", "1.0.0-beta", "", "1.0.0.0"]) expect(checkNewVersion(bad, [])).toBe("versionFormat");
  });

  it("suggests the next minor", () => {
    expect(suggestNextVersion([])).toBe("1.0.0");
    expect(suggestNextVersion(["1.0.0", "1.2.3"])).toBe("1.3.0");
    expect(suggestNextVersion(["1.999.0"])).toBe("2.0.0");
  });

  it("file sizes in readable units", () => {
    expect(sizeParts(512)).toEqual({ value: 512, unit: "B" });
    expect(sizeParts(1536)).toEqual({ value: 1.5, unit: "KB" });
    expect(sizeParts(12.4 * 1024 * 1024)).toEqual({ value: 12.4, unit: "MB" });
    expect(sizeParts(1.5 * 1024 ** 3)).toEqual({ value: 1.5, unit: "GB" });
  });
});

describe("upload tickets", () => {
  const SECRET = "test-secret-at-least-16-chars";
  const base = { b: "private" as const, k: "packs/abc/v1/0123.zip", f: "zip" as const, m: 1000, u: "admin1", p: "abc", v: "v1", n: "pack.zip" };

  it("round-trips and expires after its lifetime", () => {
    const now = Date.UTC(2026, 10, 15);
    const token = signUploadTicket(base, SECRET, now, 60);
    expect(verifyUploadTicket(token, SECRET, now + 59_000)).toMatchObject(base);
    expect(verifyUploadTicket(token, SECRET, now + 60_000)).toBeNull();
  });

  it("refuses a tampered ticket, another secret, and garbage", () => {
    const token = signUploadTicket(base, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), m: 10 ** 12 })).toString("base64url");
    expect(verifyUploadTicket(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyUploadTicket(token, "another-secret-of-16+")).toBeNull();
    for (const junk of [undefined, 42, "", "a.b.c", "x".repeat(5000), "%%%.***"]) expect(verifyUploadTicket(junk, SECRET)).toBeNull();
  });

  it("only server-made, path-safe keys can be signed", () => {
    expect(() => signUploadTicket({ ...base, k: "../../etc/passwd" }, SECRET)).toThrow();
    expect(() => signUploadTicket({ ...base, k: "Packs/Upper.zip" }, SECRET)).toThrow();
  });
});
