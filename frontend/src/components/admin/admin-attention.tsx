import { getTranslations } from "next-intl/server";
import { NotificationsButton, type NotificationItem } from "@/components/layout/notifications-button";
import { requireAdminPage } from "@backend/auth/admin-page";
import { getOpenTransferTotals } from "@backend/modules/payment/admin-service";
import { getAdminAttention } from "@backend/modules/stats/admin-service";

/**
 * Bell in the Admin top bar, left of the account button (user request 2026-11-19: "Needs attention" as a
 * notification button instead of a card on the overview). Same panel as the store's bell (DECISIONS #32): one
 * row per thing to handle — live orders awaiting payment (→ the order list filtered on PENDING), bank transfers that
 * settled nothing and still wait for an Admin (→ that list; DECISIONS #45) and packs missing a translation (→ the pack). Everything listed still needs handling, so every row counts as unread.
 * Rendered inside <Suspense> in the Admin shell; checks Admin rights before reading anything.
 */
export async function AdminAttention() {
  await requireAdminPage();
  const [a, transfers, t] = await Promise.all([getAdminAttention(), getOpenTransferTotals(), getTranslations("admin.attention")]);
  const openTransfers = transfers.real.count + transfers.demo.count;
  const items: NotificationItem[] = [
    ...(a.pending.count > 0
      ? [
          {
            id: "pending",
            icon: "order" as const,
            message: t("pendingOrders", { count: a.pending.count }),
            category: t("catOrders"),
            at: a.pending.latestAt ?? undefined,
            href: "/admin/orders?status=PENDING",
            unread: true,
          },
        ]
      : []),
    ...(openTransfers > 0
      ? [
          {
            id: "unmatched-transfers",
            icon: "order" as const,
            message: t("unmatchedTransfers", { count: openTransfers }),
            category: t("catOrders"),
            href: "/admin/orders/transfers",
            unread: true,
          },
        ]
      : []),
    ...a.untranslated.map((p) => ({
      id: p.id,
      icon: "translation" as const,
      message: t("missingTranslations", { title: p.title, locales: p.missing.map((l) => l.toUpperCase()).join(", ") }),
      category: t("catPacks"),
      at: p.updatedAt,
      href: `/admin/products/${p.id}`,
      unread: true,
    })),
  ];
  return (
    <NotificationsButton
      testId="admin-attention"
      items={items}
      copy={{
        label: items.length > 0 ? t("openCount", { count: items.length }) : t("open"),
        title: t("title"),
        emptyTitle: t("emptyTitle"),
        emptyText: t("emptyText"),
      }}
    />
  );
}
