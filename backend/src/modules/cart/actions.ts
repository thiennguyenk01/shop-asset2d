"use server";

import { refresh } from "next/cache";
import type { CouponProblem } from "@backend/lib/cart/coupon";
import { normalizeCouponCode } from "@backend/lib/cart/coupon";
import type { AddToCartBlock } from "@backend/lib/cart/rules";
import { headers } from "next/headers";
import { routing, type Locale } from "@backend/i18n/routing";
import { clientIp, couponSubjects } from "@backend/lib/rate-limit/rules";
import { getSessionUser } from "@backend/auth/guards";
import { checkRateLimit, recordFailure } from "@backend/modules/rate-limit/service";
import { addToCart, getCartSummary, removeFromCart } from "./service";
import { ensureGuestOwner, readCartOwner, saveCouponCode } from "./session";

/**
 * Cart actions (thin layer). The owner always comes from the session / httpOnly cookie on the server —
 * a client can only name a product id, and every rule (published, Premium, not owned, no duplicates) is
 * re-checked by the service.
 */
export type AddToCartActionResult = { status: "added" } | { status: "blocked"; reason: AddToCartBlock };

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

export async function addToCartAction(productId: string): Promise<AddToCartActionResult> {
  if (!isId(productId)) return { status: "blocked", reason: "notFound" };
  const user = await getSessionUser();
  const owner = user ? { kind: "user" as const, userId: user.id } : await ensureGuestOwner();
  const result = await addToCart(owner, productId);
  if (!result.ok) return { status: "blocked", reason: result.reason };
  refresh(); // cart badges
  return { status: "added" };
}

export async function removeFromCartAction(productId: string): Promise<void> {
  if (!isId(productId)) return;
  const user = await getSessionUser();
  const owner = await readCartOwner(user?.id ?? null);
  if (owner) await removeFromCart(owner, productId);
  refresh();
}

export type CouponFormState = {
  status: "idle" | "applied" | "error";
  problem?: CouponProblem | "format" | "tooManyAttempts";
  /** tooManyAttempts: whole minutes to wait (GĐ7.1). */
  retryMinutes?: number;
  minTotalVnd?: number;
  code?: string;
  /** Echo of what was typed, so the field keeps it after an error. */
  value?: string;
};

/**
 * Apply a coupon to the cart: checked against the current payable subtotal; only a valid code is remembered
 * (cookie). The discount itself is always recomputed on the server when the cart / checkout renders.
 * Failed tries are limited per shopper and per IP (GĐ7.1), so codes cannot be guessed by brute force.
 */
export async function applyCouponAction(locale: Locale, _prev: CouponFormState, form: FormData): Promise<CouponFormState> {
  const raw = form.get("code");
  const value = typeof raw === "string" ? raw.slice(0, 64) : "";
  const code = normalizeCouponCode(raw);
  if (!code) return { status: "error", problem: "format", value };
  const safeLocale = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const user = await getSessionUser();
  const owner = await readCartOwner(user?.id ?? null);
  const shopper = user ? `user:${user.id}` : owner?.kind === "guest" ? `guest:${owner.tokenHash}` : null;
  const subjects = couponSubjects(shopper, clientIp(await headers()));
  const limit = await checkRateLimit(subjects);
  if (limit.limited) return { status: "error", problem: "tooManyAttempts", retryMinutes: limit.retryAfterMinutes, value };
  const summary = await getCartSummary(owner, safeLocale, code);
  const check = summary.coupon!;
  if (!check.ok) {
    await recordFailure(subjects);
    return { status: "error", problem: check.problem, minTotalVnd: check.minTotalVnd, code, value };
  }
  await saveCouponCode(code);
  refresh();
  return { status: "applied", code };
}

export async function removeCouponAction(): Promise<void> {
  await saveCouponCode(null);
  refresh();
}
