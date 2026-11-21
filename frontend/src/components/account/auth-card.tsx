import type { ReactNode } from "react";
import { Seal } from "@/components/ui/seal";

/**
 * Frame for the sign-in / sign-up pages: one centred card (the only task on the page), the 仙 seal as the
 * brand mark, the page's <h1>, a one-line purpose, the form, and the switch link below the card.
 */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex w-full justify-center p-4 py-8 sm:p-6 sm:py-12">
      <div className="flex w-full max-w-md flex-col gap-4">
        <section className="flex flex-col gap-6 rounded-2xl border border-bronze-700 bg-ink-900 p-6 sm:p-8">
          <header className="flex flex-col items-start gap-4">
            <Seal glyphs="仙" size="sm" />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold text-balance text-ivory-100">{title}</h1>
              <p className="text-sm text-pretty text-ivory-300">{subtitle}</p>
            </div>
          </header>
          {children}
        </section>
        {footer && <div className="text-center text-sm text-ivory-300">{footer}</div>}
      </div>
    </div>
  );
}

/** Same height as the form while the session is checked, so nothing jumps. */
export function AuthFormSkeleton({ fields }: { fields: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-5 w-24 animate-pulse rounded bg-ink-800" />
          <div className="h-11 animate-pulse rounded-xl bg-ink-800" />
        </div>
      ))}
      <div className="mt-2 h-11 animate-pulse rounded-xl bg-ink-800" />
    </div>
  );
}
