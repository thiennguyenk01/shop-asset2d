"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { ADMIN_LOCALES, type AdminLocale } from "@backend/lib/admin/product-rules";
import { cn } from "@/lib/cn";

/**
 * VI / EN / ZH tabs for content fields. Every panel stays in the form (inactive ones are `hidden`), so one
 * submit sends all three languages. A tab shows a dot when its fields have an error, and "missing" when it
 * has no content yet.
 */
export function LocaleTabs({
  idPrefix,
  panel,
  errorIn,
  missing,
}: {
  idPrefix: string;
  panel: (locale: AdminLocale) => ReactNode;
  errorIn: (locale: AdminLocale) => boolean;
  missing: (locale: AdminLocale) => boolean;
}) {
  const t = useTranslations("adminProducts");
  const firstWithError = ADMIN_LOCALES.find(errorIn);
  const [active, setActive] = useState<AdminLocale>(firstWithError ?? "vi");
  const [lastError, setLastError] = useState(firstWithError);
  // Jump to the first tab with an error after a failed save (adjust state during render, no effect).
  if (firstWithError !== lastError) {
    setLastError(firstWithError);
    if (firstWithError) setActive(firstWithError);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("content")} className="flex flex-wrap gap-1 rounded-xl bg-ink-950/50 p-1">
        {ADMIN_LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${l}`}
            aria-selected={active === l}
            aria-controls={`${idPrefix}-panel-${l}`}
            onClick={() => setActive(l)}
            data-testid={`locale-tab-${l}`}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              active === l ? "bg-ink-800 font-medium text-ivory-100" : "text-ivory-300 hover:text-ivory-100",
            )}
          >
            {t(`locales.${l}`)}
            {errorIn(l) ? (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-cinnabar-500" />
            ) : (
              missing(l) && <span className="text-xs text-ivory-500">({t("localeMissing")})</span>
            )}
          </button>
        ))}
      </div>
      {ADMIN_LOCALES.map((l) => (
        <div
          key={l}
          role="tabpanel"
          id={`${idPrefix}-panel-${l}`}
          aria-labelledby={`${idPrefix}-tab-${l}`}
          hidden={active !== l}
          className="flex flex-col gap-4"
        >
          {panel(l)}
        </div>
      ))}
    </div>
  );
}
