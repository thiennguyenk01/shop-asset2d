import { getCurrentUser } from "@backend/auth/current-user";
import { getCartCount } from "@backend/modules/cart/service";
import { readCartOwner } from "@backend/modules/cart/session";
import { CartCountSync } from "./cart-count";

/** Reads the cart owner (session or guest cookie) and feeds the badge store. Render inside <Suspense>. */
export async function CartCountServer() {
  const user = await getCurrentUser();
  const owner = await readCartOwner(user?.id ?? null);
  const count = owner ? await getCartCount(owner) : 0;
  return <CartCountSync count={count} />;
}
