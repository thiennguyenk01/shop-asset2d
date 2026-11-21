"use client";

import { LogIn, Trash2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Link } from "@backend/i18n/navigation";
import { removeFromCartAction } from "@backend/modules/cart/actions";

/** Remove one pack from the cart (icon button with its name in the label). */
export function RemoveFromCartButton({ productId, title }: { productId: string; title: string }) {
  const t = useTranslations("cart");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const label = t("remove", { title });
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={label}
      title={label}
      data-testid="cart-remove"
      onClick={() =>
        startTransition(async () => {
          try {
            await removeFromCartAction(productId);
            toast({ variant: "success", title: t("removed") });
          } catch {
            toast({ variant: "error", title: t("error") });
          }
        })
      }
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-ivory-500 transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 disabled:opacity-50"
    >
      <Trash2 aria-hidden="true" className="size-4" />
    </button>
  );
}

/**
 * Checkout button (CLAUDE.md §5: paying needs an account so the packs land in the library).
 * Guests go to sign-in and come back to the cart (their cart is merged on sign-in); signed in → /checkout.
 */
export function CheckoutButton({ signedIn, disabled }: { signedIn: boolean; disabled: boolean }) {
  const t = useTranslations("cart");
  if (!signedIn) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={{ pathname: "/login", query: { callbackUrl: "/cart" } }} data-testid="checkout">
          <LogIn aria-hidden="true" className="size-4" />
          {t("signInToCheckout")}
        </Link>
      </Button>
    );
  }
  if (disabled) {
    return (
      <Button size="lg" className="w-full" disabled data-testid="checkout">
        <Zap aria-hidden="true" className="size-4" />
        {t("checkout")}
      </Button>
    );
  }
  return (
    <Button asChild size="lg" className="w-full">
      <Link href="/checkout" data-testid="checkout">
        <Zap aria-hidden="true" className="size-4" />
        {t("checkout")}
      </Link>
    </Button>
  );
}
