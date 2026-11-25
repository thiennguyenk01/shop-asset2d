import { useTranslations } from "next-intl";
import { Link } from "@backend/i18n/navigation";
import { LEGAL_PAGES } from "@backend/lib/info-pages";

/**
 * Terms · Privacy · Refund above the copyright line (sidebar on desktop, "More" sheet on mobile). Not a menu
 * group: DECISIONS #20 keeps "Legal" out of the menu. Works in server and client components.
 */
export function LegalLinks({ onNavigate, className = "" }: { onNavigate?: () => void; className?: string }) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("legalLabel")} className={className}>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {LEGAL_PAGES.map((page) => (
          <li key={page}>
            <Link href={`/${page}`} onClick={onNavigate} className="inline-flex min-h-6 items-center text-xs text-ivory-500 underline-offset-4 transition-colors hover:text-ivory-100 hover:underline">
              {t(page)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
