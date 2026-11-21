import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "@backend/storage/local";
import { assertSafeKey } from "@backend/storage/types";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), "eam-storage-"));
});
afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("assertSafeKey", () => {
  it.each(["products/abc/v1/pack.zip", "a", "x-1/y_2.png"])("accepts %s", (key) => {
    expect(() => assertSafeKey(key)).not.toThrow();
  });

  it.each([
    "",
    "../secret.zip",
    "products/../../etc/passwd",
    "/abs/path.zip",
    "C:\\windows\\x",
    "products\\..\\x",
    "products//x",
    "products/./x",
    "Products/Upper.zip",
    "trailing/",
  ])("rejects %j", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });
});

describe("LocalStorage", () => {
  it("refuses a root inside public/", () => {
    expect(() => new LocalStorage("public/storage", projectRoot)).toThrow(/public/);
    expect(() => new LocalStorage("public", projectRoot)).toThrow(/public/);
  });

  it("refuses the project root itself", () => {
    expect(() => new LocalStorage(".", projectRoot)).toThrow();
  });

  it("stores private files under .storage/private, outside public/", async () => {
    const storage = new LocalStorage(".storage", projectRoot);
    const body = new TextEncoder().encode("demo pack");
    await storage.put("private", "products/p1/v1/pack.zip", body);

    expect(await storage.exists("private", "products/p1/v1/pack.zip")).toBe(true);
    expect(await storage.exists("public", "products/p1/v1/pack.zip")).toBe(false);
    expect(new TextDecoder().decode(await storage.read("private", "products/p1/v1/pack.zip"))).toBe("demo pack");

    await storage.remove("private", "products/p1/v1/pack.zip");
    expect(await storage.exists("private", "products/p1/v1/pack.zip")).toBe(false);
  });

  it("rejects traversal attempts on every operation", async () => {
    const storage = new LocalStorage(".storage", projectRoot);
    await expect(storage.read("private", "../public/x")).rejects.toThrow();
    await expect(storage.put("public", "../private/stolen.zip", new Uint8Array())).rejects.toThrow();
    await expect(storage.exists("private", "..")).rejects.toThrow();
  });
});
