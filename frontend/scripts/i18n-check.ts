/**
 * Verifies every frontend/messages/<locale>.json (CLAUDE.md §8):
 * one file per configured locale, identical key sets, no empty values, only string leaves.
 *
 *   npm run i18n:check
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { routing } from "@backend/i18n/routing";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function flattenMessages(obj: Json, prefix = "", out = new Map<string, Json>()): Map<string, Json> {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flattenMessages(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, obj);
  }
  return out;
}

export function compareMessages(locales: Record<string, Json>): string[] {
  const problems: string[] = [];
  const flat = Object.fromEntries(Object.entries(locales).map(([l, m]) => [l, flattenMessages(m)]));
  const allKeys = new Set(Object.values(flat).flatMap((m) => [...m.keys()]));
  for (const key of [...allKeys].sort()) {
    for (const [locale, messages] of Object.entries(flat)) {
      if (!messages.has(key)) {
        problems.push(`[${locale}] thiếu key "${key}"`);
        continue;
      }
      const value = messages.get(key);
      if (typeof value !== "string") problems.push(`[${locale}] "${key}" phải là chuỗi`);
      else if (value.trim() === "") problems.push(`[${locale}] "${key}" đang rỗng`);
      // Be Vietnam Pro renders the Chinese double dash "——" as two separate dashes (CLAUDE.md §9).
      else if (value.includes("——")) problems.push(`[${locale}] "${key}" dùng "——" (hãy dùng dấu câu "，。·")`);
    }
  }
  return problems;
}

/** Loads frontend/messages/<locale>.json for every locale in backend/src/i18n/routing.ts (a missing file throws). */
export function loadMessages(dir = path.resolve(process.cwd(), "frontend/messages")): Record<string, Json> {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, JSON.parse(readFileSync(path.join(dir, `${locale}.json`), "utf8"))]),
  );
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/i18n-check.ts")) {
  const messages = loadMessages();
  const problems = compareMessages(messages);
  if (problems.length > 0) {
    console.error(`✖ i18n-check: ${problems.length} lỗi\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`✔ i18n-check: ${Object.keys(messages).join(", ")} khớp nhau, không có giá trị rỗng.`);
}
