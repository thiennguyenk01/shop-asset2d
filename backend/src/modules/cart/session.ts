import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { normalizeCouponCode } from "@backend/lib/cart/coupon";
import { mergeGuestCart, type CartOwner } from "./service";

/**
 * Guest carts: a random 256-bit token in an httpOnly cookie; the database only stores its SHA-256
 * (Cart.guestToken), so a database leak does not hand out usable cart cookies.
 */
export const GUEST_CART_COOKIE = "cart";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
} as const;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Read-only (server components + actions): the cart owner for this request, or null for a guest with no cart yet. */
export async function readCartOwner(userId: string | null): Promise<CartOwner | null> {
  if (userId) return { kind: "user", userId };
  const token = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  return token && TOKEN_RE.test(token) ? { kind: "guest", tokenHash: hashToken(token) } : null;
}

/** Server actions only: the guest owner, creating the cookie on first use. */
export async function ensureGuestOwner(): Promise<CartOwner> {
  const jar = await cookies();
  let token = jar.get(GUEST_CART_COOKIE)?.value;
  if (!token || !TOKEN_RE.test(token)) {
    token = randomBytes(32).toString("base64url");
    jar.set(GUEST_CART_COOKIE, token, COOKIE_OPTIONS);
  }
  return { kind: "guest", tokenHash: hashToken(token) };
}

/**
 * The coupon code the shopper applied (httpOnly cookie, code only). It is never trusted: every render and
 * the checkout re-check it against the database and the current cart (backend/src/lib/cart/coupon.ts).
 */
export const COUPON_COOKIE = "cart_coupon";

export async function readCouponCode(): Promise<string | null> {
  return normalizeCouponCode((await cookies()).get(COUPON_COOKIE)?.value);
}

/** Server actions only. */
export async function saveCouponCode(code: string | null): Promise<void> {
  const jar = await cookies();
  if (code) jar.set(COUPON_COOKIE, code, COOKIE_OPTIONS);
  else jar.delete(COUPON_COOKIE);
}

/** Server actions only, right after a successful sign-in: fold the guest cart into the account and drop the cookie. */
export async function mergeGuestCartOnSignIn(userId: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(GUEST_CART_COOKIE)?.value;
  if (!token) return;
  jar.delete(GUEST_CART_COOKIE);
  if (!TOKEN_RE.test(token)) return;
  try {
    await mergeGuestCart(hashToken(token), userId);
  } catch (e) {
    // Never block a sign-in because of the cart; the guest lines are simply not carried over.
    console.error("[cart] merge on sign-in failed", e);
  }
}
