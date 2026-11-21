/**
 * Remembered per-browser UI state, applied by an inline script in layout.tsx before first paint (no flash).
 * Plain module on purpose: constants exported from a "use client" file are client references on the server,
 * so the layout would inline an error stub instead of the script text.
 */
export const SIDEBAR_STORAGE_KEY = "sidebar";
export const THEME_STORAGE_KEY = "theme";

export const INIT_SCRIPT =
  `try{var d=document.documentElement;` +
  `if(localStorage.getItem("${SIDEBAR_STORAGE_KEY}")==="collapsed")d.dataset.sidebar="collapsed";` +
  `if(localStorage.getItem("${THEME_STORAGE_KEY}")==="light")d.dataset.theme="light"}catch(e){}`;

/**
 * The same as INIT_SCRIPT, for the browser. React clears the attributes it does not manage on <html> when it
 * builds a new root layout in the browser (switching language) and the inline script does not run again then,
 * so `RememberedUiState` calls this before paint. Keep the two in step (frontend/tests/unit/init-scripts.test.ts).
 */
export function applyRememberedUiState(root: HTMLElement = document.documentElement) {
  try {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed") root.dataset.sidebar = "collapsed";
    if (localStorage.getItem(THEME_STORAGE_KEY) === "light") root.dataset.theme = "light";
  } catch {
    // Storage unavailable (private mode): keep the defaults, as the inline script does.
  }
}
