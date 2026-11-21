import { getTranslations } from "next-intl/server";
import { Link } from "@backend/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Tabs of the Admin "Orders" area (user request 2026-11-21): the order list and the bank transfers that settled
 * nothing (DECISIONS #45), with how many of those still wait for an Admin. Rendered after the Admin check.
 */
export async function OrderTabs({ active, openTransfers }: { active: "orders" | "transfers"; openTransfers: number }) {
  const t = await getTranslations("adminOrders.tabs");
  const tab = (key: "orders" | "transfers", href: string, label: string, count?: number) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={cn(
        "-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors",
        active === key ? "border-gold-500 text-gold-300" : "border-transparent text-ivory-300 hover:text-ivory-100",
      )}
      data-testid={`order-tab-${key}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cinnabar-600 px-1.5 text-xs text-paper tabular-nums" data-testid="open-transfer-count">
          {count}
        </span>
      )}
    </Link>
  );
  return (
    <nav aria-label={t("label")} className="flex gap-6 border-b border-bronze-700">
      {tab("orders", "/admin/orders", t("orders"))}
      {tab("transfers", "/admin/orders/transfers", t("transfers"), openTransfers)}
    </nav>
  );
}
