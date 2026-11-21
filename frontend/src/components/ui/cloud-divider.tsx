import { cn } from "@/lib/cn";

/** Auspicious-cloud (tường vân) divider. Decorative. */
export function CloudDivider({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-3 text-gold-500/70", className)}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500/50" />
      <svg viewBox="0 0 64 20" className="h-4 w-14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M4 14c0-4 5-6 8-3 0-5 7-7 10-2 2-4 9-4 10 1" />
        <path d="M60 14c0-4-5-6-8-3 0-5-7-7-10-2" />
        <circle cx="32" cy="12" r="2.2" fill="currentColor" stroke="none" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500/50" />
    </div>
  );
}
