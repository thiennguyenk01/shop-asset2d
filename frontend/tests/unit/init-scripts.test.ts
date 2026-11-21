import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyRememberedUiState,
  INIT_SCRIPT,
  SIDEBAR_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "@/components/layout/init-scripts";

/**
 * The inline script (first load) and applyRememberedUiState (a root layout built in the browser, e.g. after
 * switching language) must leave <html> in the same state for every remembered value.
 */
type Root = { dataset: Record<string, string> };

function withStorage(values: Record<string, string> | "throws") {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      if (values === "throws") throw new Error("SecurityError");
      return values[key] ?? null;
    },
  });
}

function runInlineScript(): Root {
  const root: Root = { dataset: {} };
  new Function("document", INIT_SCRIPT)({ documentElement: root });
  return root;
}

function runClientFunction(): Root {
  const root: Root = { dataset: {} };
  applyRememberedUiState(root as unknown as HTMLElement);
  return root;
}

afterEach(() => vi.unstubAllGlobals());

describe("remembered UI state (theme, sidebar)", () => {
  const cases: [string, Record<string, string> | "throws", Record<string, string>][] = [
    ["nothing remembered", {}, {}],
    ["light + collapsed", { [THEME_STORAGE_KEY]: "light", [SIDEBAR_STORAGE_KEY]: "collapsed" }, { theme: "light", sidebar: "collapsed" }],
    ["dark + expanded", { [THEME_STORAGE_KEY]: "dark", [SIDEBAR_STORAGE_KEY]: "expanded" }, {}],
    ["light only", { [THEME_STORAGE_KEY]: "light" }, { theme: "light" }],
    ["unknown values", { [THEME_STORAGE_KEY]: "blue", [SIDEBAR_STORAGE_KEY]: "half" }, {}],
    ["storage unavailable", "throws", {}],
  ];

  it.each(cases)("%s: the inline script and the client function agree", (_label, stored, expected) => {
    withStorage(stored);
    expect(runInlineScript().dataset).toEqual(expected);
    expect(runClientFunction().dataset).toEqual(expected);
  });
});
