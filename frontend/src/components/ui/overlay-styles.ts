/**
 * Shared shapes for floating layers and the controls that open them (evondevKit overlay.md "Dropdown",
 * choice-controls.md "Select"). One source so every menu, select and popover in the app looks the same.
 */

/** Floating panel: rounded-2xl, hairline border, one step lighter than cards, shadow (floating layers only), motion. */
export const overlayPanel = "z-70 rounded-2xl border border-bronze-700 bg-ink-850 shadow-panel animate-overlay";

/** Item list inside a panel: 4px around and between items. */
export const overlayList = "flex flex-col gap-1 p-1";

/** Menu item: min 40px tall, rounded-xl (16 = 12 + 4, concentric with the panel), highlight = light overlay. */
export const overlayItem =
  "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ivory-100 outline-hidden select-none data-[highlighted]:bg-ivory-100/5";

/**
 * Filter / select trigger outside a form: looks like an input, no hover (locked rule 6); while open it takes the
 * input focus look (accent border + soft ring). Active filter = accent text so the toolbar shows what is on.
 */
export const filterTrigger =
  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-bronze-600 bg-ink-900 px-3.5 text-sm text-ivory-100 md:h-10 data-[state=open]:border-gold-500 data-[state=open]:ring-2 data-[state=open]:ring-gold-500/25";
