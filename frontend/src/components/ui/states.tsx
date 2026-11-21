import { AlertTriangle, CheckCircle2, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Loading / Empty / Error / Success states (CLAUDE.md §9). All text is passed in by
 * the caller from the translation files — these components contain no UI strings.
 */

export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-ivory-300", className)}>
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-gold-400" />
      <span>{label}</span>
    </span>
  );
}

type StateProps = { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string };

function StateBox({
  icon,
  tone,
  title,
  description,
  action,
  className,
  role,
}: StateProps & { icon: ReactNode; tone: string; role?: "alert" | "status" }) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center",
        tone,
        className,
      )}
    >
      {icon}
      <p className="font-heading text-lg text-ivory-100">{title}</p>
      {description && <p className="max-w-md text-sm text-ivory-300">{description}</p>}
      {action}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateBox {...props} tone="border-bronze-600" icon={<Inbox aria-hidden="true" className="size-8 text-ivory-500" />} />;
}

export function ErrorState(props: StateProps) {
  return (
    <StateBox
      {...props}
      role="alert"
      tone="border-cinnabar-600/70 bg-cinnabar-700/10"
      icon={<AlertTriangle aria-hidden="true" className="size-8 text-cinnabar-500" />}
    />
  );
}

export function SuccessState(props: StateProps) {
  return (
    <StateBox
      {...props}
      role="status"
      tone="border-jade-500/60 bg-jade-700/10"
      icon={<CheckCircle2 aria-hidden="true" className="size-8 text-jade-400" />}
    />
  );
}
