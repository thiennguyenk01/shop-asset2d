import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { UsageLevel } from "@backend/lib/usage/rules";
import { cn } from "@/lib/cn";

const BAR: Record<UsageLevel, string> = { ok: "bg-jade-500", warn: "bg-gold-400", critical: "bg-cinnabar-500" };
const TEXT: Record<UsageLevel, string> = { ok: "text-jade-400", warn: "text-gold-300", critical: "text-cinnabar-500" };
const ICON = { ok: CircleCheck, warn: TriangleAlert, critical: CircleAlert } as const;

/** One allowance: label, "used / limit", a bar, and the level as icon + word (never colour alone). */
export function UsageMeter(props: {
  testId: string;
  title: string;
  amount: string;
  percent: number;
  level: UsageLevel;
  levelLabel: string;
  children?: React.ReactNode;
}) {
  const Icon = ICON[props.level];
  return (
    <section data-testid={props.testId} data-level={props.level} className="flex flex-col gap-3 rounded-2xl border border-bronze-700 bg-ink-900 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-sans text-base font-semibold text-ivory-100">{props.title}</h2>
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", TEXT[props.level])}>
          <Icon aria-hidden="true" className="size-4" />
          {props.levelLabel}
        </span>
      </div>
      <p className="text-sm text-ivory-300 tabular-nums">
        {props.amount} <span className="text-ivory-500">· {props.percent}%</span>
      </p>
      <div
        role="meter"
        aria-label={props.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(props.percent, 100)}
        className="h-2 overflow-hidden rounded-full bg-ink-800"
      >
        <div className={cn("h-full rounded-full", BAR[props.level])} style={{ width: `${Math.min(Math.max(props.percent, 1), 100)}%` }} />
      </div>
      {props.children && <div className="flex flex-col gap-1 text-xs text-pretty text-ivory-500">{props.children}</div>}
    </section>
  );
}
