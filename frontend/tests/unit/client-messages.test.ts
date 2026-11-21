import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_CLIENT_MESSAGES, pickMessages, SITE_CLIENT_MESSAGES } from "@/i18n/client-messages";
import { FLASH_MESSAGE } from "@backend/lib/flash";
import vi from "../../messages/vi.json" with { type: "json" };

/**
 * GĐ7.3 — only the translations client components read are sent to the browser (frontend/src/i18n/client-messages.ts).
 * These tests read the source: a client component that starts using a namespace missing from the lists fails here
 * (instead of showing a raw key to a customer).
 */
const SRC = path.resolve(__dirname, "../../src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );
const all = files(SRC).map((f) => ({ file: path.relative(SRC, f).split(path.sep).join("/"), text: readFileSync(f, "utf8") }));
const isClient = (text: string) => /^\s*["']use client["']/.test(text);
const namespacesOf = (text: string) => [...text.matchAll(/useTranslations\("([^"]+)"\)/g)].map((m) => m[1]);
const covered = (list: readonly string[], ns: string) => list.some((p) => ns === p || ns.startsWith(`${p}.`));
const isAdminFile = (file: string) => file.startsWith("components/admin/") || file.includes("/admin/");

describe("translations sent to the browser", () => {
  it("every namespace a client component reads is in its list (Admin components: the Admin list)", () => {
    const missing: string[] = [];
    for (const { file, text } of all.filter((f) => isClient(f.text))) {
      const list = isAdminFile(file) ? ADMIN_CLIENT_MESSAGES : SITE_CLIENT_MESSAGES;
      for (const ns of namespacesOf(text)) if (!covered(list, ns)) missing.push(`${file}: "${ns}"`);
    }
    expect(missing).toEqual([]);
  });

  it("the flash toast's keys (read with useTranslations() in the root layout) are in the site list", () => {
    for (const key of Object.values(FLASH_MESSAGE)) expect(covered(SITE_CLIENT_MESSAGES, key), key).toBe(true);
  });

  it("a file using useTranslations without 'use client' is never imported by a client component", () => {
    const serverSide = all.filter((f) => !isClient(f.text) && /useTranslations\(/.test(f.text));
    const clientText = all.filter((f) => isClient(f.text)).map((f) => f.text);
    for (const { file } of serverSide) {
      const spec = `@/${file.replace(/\.tsx?$/, "")}`;
      expect(clientText.some((t) => t.includes(`"${spec}"`)), file).toBe(false);
    }
  });

  it("every listed namespace exists, and the lists are much smaller than the whole file", () => {
    for (const p of ADMIN_CLIENT_MESSAGES) {
      const v = p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], vi);
      expect(v, p).toBeTypeOf("object");
    }
    const size = (o: unknown) => JSON.stringify(o).length;
    expect(size(pickMessages(vi, SITE_CLIENT_MESSAGES))).toBeLessThan(size(vi) * 0.6);
  });
});

describe("pickMessages", () => {
  const messages = { a: { x: "1", y: "2" }, b: { flash: { ok: "3" }, other: "4" }, c: "5" };
  it("keeps whole namespaces and sub-trees, nothing else; unknown paths are skipped", () => {
    expect(pickMessages(messages, ["a", "b.flash", "zzz", "b.nope"])).toEqual({ a: { x: "1", y: "2" }, b: { flash: { ok: "3" } } });
    expect(pickMessages(messages, ["b.flash", "b.other"])).toEqual({ b: { flash: { ok: "3" }, other: "4" } });
  });
});
