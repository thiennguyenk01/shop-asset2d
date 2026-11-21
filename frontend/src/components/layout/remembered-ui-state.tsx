"use client";

import { useLayoutEffect } from "react";
import { applyRememberedUiState, INIT_SCRIPT } from "./init-scripts";

/**
 * Applies the remembered theme and sidebar state (init-scripts.ts) without a flash, following
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md:
 * - first load: the inline script runs while the HTML is parsed, before the first paint;
 * - a root layout built in the browser (switching language): scripts never run there, so the script is
 *   rendered as `text/plain` on the client (React would otherwise warn "Encountered a script tag…") and the
 *   layout effect applies the same state before paint (React has just cleared the attributes on <html>).
 * `suppressHydrationWarning` covers the `type` that differs between the server HTML and the client.
 */
export function RememberedUiState() {
  useLayoutEffect(() => applyRememberedUiState(), []);
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }}
    />
  );
}
