import { describe, expect, it } from "vitest";
import { R2Storage } from "@backend/storage/r2";
import {
  attachmentDisposition,
  cacheControlFor,
  contentTypeFor,
  publicObjectUrl,
  r2Endpoint,
} from "@backend/storage/r2-rules";

/** GĐ7.5: the R2 driver's pure rules, and its presigned links (signed locally, no network). */
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const r2 = new R2Storage({
  accountId: ACCOUNT,
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  publicBucket: "shop-public",
  privateBucket: "shop-private",
});

describe("r2 rules", () => {
  it("endpoint and public URLs", () => {
    expect(r2Endpoint(ACCOUNT)).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(publicObjectUrl("https://media.example.com/", "packs/p1/media/a.png")).toBe(
      "https://media.example.com/packs/p1/media/a.png",
    );
  });
  it("never builds a public URL from an unsafe key", () => {
    for (const key of ["../private/x.zip", "/abs.png", "a//b.png", "A.png", ""])
      expect(() => publicObjectUrl("https://media.example.com", key), key).toThrow();
  });
  it("content type from the extension", () => {
    expect(contentTypeFor("packs/p/media/x.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("demo/x.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("packs/p/v/x.7z")).toBe("application/x-7z-compressed");
    expect(contentTypeFor("x.unknown")).toBe("application/octet-stream");
  });
  it("cache: uploads a year, other public objects an hour, private never", () => {
    expect(cacheControlFor("public", "packs/p/media/x.png")).toContain("immutable");
    expect(cacheControlFor("public", "demo/cover.svg")).toBe("public, max-age=3600");
    expect(cacheControlFor("private", "packs/p/v/x.zip")).toBe("private, no-store");
  });
  it("download name: always an attachment, ASCII fallback + UTF-8 name, no header injection", () => {
    const d = attachmentDisposition("Bộ Kiếm Hiệp.zip");
    expect(d.startsWith("attachment; ")).toBe(true);
    expect(d).toContain(`filename*=UTF-8''B%E1%BB%99%20Ki%E1%BA%BFm%20Hi%E1%BB%87p.zip`);
    expect(attachmentDisposition('a"b\r\nX-Evil: 1;.zip')).not.toMatch(/[\r\n]|"[^;]*"[^;]*"/);
  });
});

describe("r2 presigned links", () => {
  it("download link: private bucket, S3 endpoint only, one minute, attachment", async () => {
    const u = new URL(await r2.presignDownload("packs/p1/v1/abc.zip", "Bộ thử.zip"));
    expect(u.origin).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(u.pathname).toBe("/shop-private/packs/p1/v1/abc.zip");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(u.searchParams.get("response-content-disposition")).toMatch(/^attachment; /);
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("upload link: signs type, cache and length; no checksum the browser could not match", async () => {
    const t = await r2.presignUpload("public", "packs/p1/media/abc.png", 1234);
    const u = new URL(t.url);
    expect(u.pathname).toBe("/shop-public/packs/p1/media/abc.png");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(u.searchParams.get("X-Amz-SignedHeaders")?.split(";").sort()).toEqual(
      ["cache-control", "content-length", "content-type", "host"],
    );
    expect([...u.searchParams.keys()].some((k) => k.toLowerCase().includes("checksum"))).toBe(false);
    expect(t.headers).toEqual({ "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" });
  });
  it("sellable files upload to the private bucket", async () => {
    const t = await r2.presignUpload("private", "packs/p1/v1/abc.zip", 10);
    expect(new URL(t.url).pathname.startsWith("/shop-private/")).toBe(true);
    expect(t.headers["Cache-Control"]).toBe("private, no-store");
  });
  it("refuses unsafe keys before signing anything", async () => {
    await expect(r2.presignDownload("../x.zip", "x.zip")).rejects.toThrow();
    await expect(r2.presignUpload("public", "a/../b.png", 1)).rejects.toThrow();
  });
});
