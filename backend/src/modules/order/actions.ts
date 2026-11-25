"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect as redirectExternal } from "next/navigation";
import { redirect } from "@backend/i18n/navigation";
import { publicOrigin } from "@backend/lib/http/origin";
import { routing, type Locale } from "@backend/i18n/routing";
import { getSessionUser } from "@backend/auth/guards";
import { getEnv } from "@backend/env";
import type { AmountRange } from "@backend/lib/payment/limits";
import { getActiveProvider } from "@backend/modules/payment/providers";
import { readCouponCode, saveCouponCode } from "@backend/modules/cart/session";
import { cancelOrder, placeExtraDownloadsOrder, placeOrder, type PaymentBlock, type PlaceOrderBlock } from "./service";

/**
 * `range`: the totals the active gateway accepts, sent with "amountNotSupported" so the message can name them ·
 * `orderCode`: the order already waiting for payment, sent with "pendingOrder".
 */
export type PlaceOrderState = { status: "idle" } | { status: "error"; reason: PlaceOrderBlock; range?: AmountRange; orderCode?: string };

const rangeFor = (reason: string): { range?: AmountRange } => (reason === "amountNotSupported" ? { range: getActiveProvider().amountRange } : {});

const safeLocale = (l: string): Locale => ((routing.locales as readonly string[]).includes(l) ? (l as Locale) : routing.defaultLocale);

/** Where the payment gateway sends the buyer back and its notifications (lib/http/origin.ts). */
async function siteOrigin(): Promise<string> {
  const env = getEnv();
  return publicOrigin({ headers: await headers(), appUrl: env.APP_URL, deployed: env.APP_ENV === "preview" || env.APP_ENV === "production" });
}

/** To the gateway: a path of this site (Demo) keeps the locale; the gateway's own https page (MoMo) is left as is. */
function goToPayment(to: string, locale: Locale): never {
  if (to.startsWith("https://")) redirectExternal(to);
  redirect({ href: to, locale });
  throw new Error("unreachable");
}

/**
 * "Confirm order" on the checkout page (thin layer): the user comes from the session; the cart, prices and
 * coupon are re-read on the server. The only client value is the total the buyer saw, used to refuse an
 * order whose price changed in the meantime. Once the order exists, the applied coupon is forgotten: it belongs
 * to that order now and must not follow the shopper into the next cart (user request 2026-11-19).
 */
export async function placeOrderAction(locale: string, _prev: PlaceOrderState, form: FormData): Promise<PlaceOrderState> {
  const loc = safeLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/checkout" } }, locale: loc });
  const expected = Number(form.get("expectedTotal"));
  if (!Number.isSafeInteger(expected) || expected < 0) return { status: "error", reason: "priceChanged" };

  const result = await placeOrder({
    userId: user!.id,
    locale: loc,
    couponCode: await readCouponCode(),
    expectedTotalVnd: expected,
    origin: await siteOrigin(),
  });
  if (!result.ok) {
    refresh(); // show the current cart / prices (and the order waiting for payment, if that is the reason)
    return { status: "error", reason: result.reason, ...rangeFor(result.reason), ...(result.orderCode ? { orderCode: result.orderCode } : {}) };
  }
  await saveCouponCode(null);
  goToPayment(result.redirectTo, loc);
}

export type ExtraDownloadsActionResult = { status: "error"; reason: "notFound" | "notFree" | PaymentBlock; range?: AmountRange; orderCode?: string };

/**
 * "Buy N more downloads" of a free pack (step 4.6). Only the pack id comes from the client; who buys comes
 * from the session, count and price from the server. Success → straight to the payment gateway.
 */
export async function buyExtraDownloadsAction(locale: string, productId: string): Promise<ExtraDownloadsActionResult> {
  const loc = safeLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/library" } }, locale: loc });
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) return { status: "error", reason: "notFound" };

  const result = await placeExtraDownloadsOrder({ userId: user!.id, productId, locale: loc, origin: await siteOrigin() });
  if (!result.ok) {
    if (result.reason === "signInRequired") redirect({ href: { pathname: "/login", query: { callbackUrl: "/library" } }, locale: loc });
    return {
      status: "error",
      reason: result.reason === "signInRequired" ? "notFound" : result.reason,
      ...rangeFor(result.reason),
      ...(result.orderCode ? { orderCode: result.orderCode } : {}),
    };
  }
  goToPayment(result.redirectTo, loc);
}

export type CancelOrderActionResult = { status: "cancelled" } | { status: "error"; reason: "notFound" | "notOpen" | "gateway" };

/**
 * "Cancel this order" (user choice 2026-11-26: checkout asks before a new order; the order page offers it too).
 * The account comes from the session and only its own order can be cancelled; the page then re-reads everything
 * (the button that called it may disappear with that render, so the button shows the toast itself).
 */
export async function cancelOrderAction(locale: string, orderCode: string): Promise<CancelOrderActionResult> {
  const loc = safeLocale(locale);
  const user = await getSessionUser();
  if (!user) redirect({ href: { pathname: "/login", query: { callbackUrl: "/orders" } }, locale: loc });
  const result = await cancelOrder(user!.id, typeof orderCode === "string" ? orderCode : "");
  refresh();
  return result.ok ? { status: "cancelled" } : { status: "error", reason: result.reason };
}
