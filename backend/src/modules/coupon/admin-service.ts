import "server-only";
import {
  ADMIN_COUPONS_PAGE_SIZE,
  couponState,
  couponUsed,
  parseCouponForm,
  type CouponField,
  type CouponFieldError,
  type CouponFilterState,
  type CouponFormRaw,
  type CouponKind,
  type CouponState,
} from "@backend/lib/admin/coupon-rules";
import { effectiveOrderStatus, type OrderStatus } from "@backend/lib/payment/rules";
import {
  createCouponRows,
  deleteCouponRows,
  findAdminCoupon,
  findAdminCouponsPage,
  updateCouponRows,
} from "./admin-repository";

/**
 * Admin coupons (GĐ5.6, DECISIONS #35): list, detail (with the orders that carry it), create, edit (a used coupon
 * keeps its code / kind / value), delete (only if nobody used it). The page and action layers check the Admin;
 * this layer applies lib/admin/coupon-rules.ts.
 */
const COUPON_ID_RE = /^[a-z0-9]{10,40}$/;
const isCouponId = (v: unknown): v is string => typeof v === "string" && COUPON_ID_RE.test(v);

export type AdminCouponListItem = {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  minTotalVnd: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  usedCount: number;
  isActive: boolean;
  state: CouponState;
  used: boolean;
};

type Row = Awaited<ReturnType<typeof findAdminCouponsPage>>[1][number];
const toItem = (c: Row, now: Date): AdminCouponListItem => ({
  id: c.id,
  code: c.code,
  kind: c.kind,
  value: c.value,
  minTotalVnd: c.minTotalVnd,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  maxUses: c.maxUses,
  maxUsesPerUser: c.maxUsesPerUser,
  usedCount: c.usedCount,
  isActive: c.isActive,
  state: couponState(c, now),
  used: couponUsed({ usedCount: c.usedCount, orderCount: c._count.orders }),
});

export async function listAdminCoupons(
  filters: { q: string; state?: CouponFilterState },
  page: number,
  now = new Date(),
): Promise<{ items: AdminCouponListItem[]; total: number; page: number; pageCount: number }> {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [total, rows] = await findAdminCouponsPage(
    filters,
    now,
    (safePage - 1) * ADMIN_COUPONS_PAGE_SIZE,
    ADMIN_COUPONS_PAGE_SIZE,
  );
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_COUPONS_PAGE_SIZE));
  if (safePage > pageCount && total > 0) return listAdminCoupons(filters, pageCount, now);
  return { items: rows.map((c) => toItem(c, now)), total, page: Math.min(safePage, pageCount), pageCount };
}

export type AdminCouponView = AdminCouponListItem & {
  createdAt: Date;
  updatedAt: Date;
  orderCount: number;
  paidCount: number;
  orders: {
    code: string;
    status: OrderStatus;
    totalVnd: number;
    discountVnd: number;
    isDemo: boolean;
    createdAt: Date;
    userId: string;
    userEmail: string;
  }[];
};

export async function getAdminCoupon(id: string, now = new Date()): Promise<AdminCouponView | null> {
  if (!isCouponId(id)) return null;
  const c = await findAdminCoupon(id);
  if (!c) return null;
  return {
    ...toItem(c, now),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    orderCount: c._count.orders,
    paidCount: c._count.redemptions,
    orders: c.orders.map((o) => ({
      code: o.code,
      status: effectiveOrderStatus(o, now),
      totalVnd: o.totalVnd,
      discountVnd: o.discountVnd,
      isDemo: o.isDemo,
      createdAt: o.createdAt,
      userId: o.user.id,
      userEmail: o.user.email,
    })),
  };
}

export type CouponFormErrors = Partial<Record<CouponField, CouponFieldError | "codeTaken" | "locked">>;
export type SaveCouponResult =
  { ok: true; id: string; changed: boolean } | { ok: false; error?: "notFound"; fields?: CouponFormErrors };

export async function createAdminCoupon(raw: CouponFormRaw, adminId: string): Promise<SaveCouponResult> {
  const parsed = parseCouponForm(raw);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  const r = await createCouponRows(parsed.value, adminId);
  if (!r.ok) return { ok: false, fields: { code: "codeTaken" } };
  return { ok: true, id: r.id, changed: true };
}

export async function updateAdminCoupon(id: string, raw: CouponFormRaw, adminId: string): Promise<SaveCouponResult> {
  if (!isCouponId(id)) return { ok: false, error: "notFound" };
  const parsed = parseCouponForm(raw);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  const r = await updateCouponRows(id, parsed.value, adminId);
  if (r.ok) return { ok: true, id, changed: r.changed };
  if (r.error === "notFound") return { ok: false, error: "notFound" };
  if (r.error === "codeTaken") return { ok: false, fields: { code: "codeTaken" } };
  return { ok: false, fields: Object.fromEntries((r.fields ?? []).map((f) => [f, "locked"])) };
}

export async function deleteAdminCoupon(
  id: string,
  adminId: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "used" }> {
  if (!isCouponId(id)) return { ok: false, error: "notFound" };
  return deleteCouponRows(id, adminId);
}
