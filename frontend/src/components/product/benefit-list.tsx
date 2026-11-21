import { Check, X } from "lucide-react";

/** Included / not included benefit rows (icon + text; the state is also spelled out for screen readers). */
export function BenefitList({
  rows,
  included,
  notIncluded,
  testId,
  twoColumns,
}: {
  rows: { key: string; included: boolean; label: string }[];
  included: string;
  notIncluded: string;
  testId?: string;
  twoColumns?: boolean;
}) {
  return (
    <ul className={twoColumns ? "grid gap-2 sm:grid-cols-2" : "flex flex-col gap-2"} data-testid={testId}>
      {rows.map(({ key, included: ok, label }) => (
        <li key={key} className="flex items-start gap-2 text-sm">
          {ok ? (
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-jade-400" />
          ) : (
            <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-cinnabar-500" />
          )}
          <span className={ok ? "text-ivory-100" : "text-ivory-500"}>{label}</span>
          <span className="sr-only">: {ok ? included : notIncluded}</span>
        </li>
      ))}
    </ul>
  );
}
