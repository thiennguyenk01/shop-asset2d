import { FlaskConical } from "lucide-react";

/**
 * "DEMO MODE — no real transactions" (CLAUDE.md §6): always shown on checkout, the demo gateway and demo
 * order results, so a demo purchase can never be mistaken for a real one.
 */
export function DemoBanner({ title, text }: { title: string; text: string }) {
  return (
    <div role="note" className="flex gap-3 rounded-2xl border-2 border-dashed border-cinnabar-600/70 bg-cinnabar-700/10 p-4" data-testid="demo-banner">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cinnabar-600 text-paper">
        <FlaskConical aria-hidden="true" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-semibold tracking-wide text-ivory-100">{title}</p>
        <p className="text-xs text-pretty text-ivory-300">{text}</p>
      </div>
    </div>
  );
}
