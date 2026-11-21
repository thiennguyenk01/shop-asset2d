"use client";

import { ShoppingCart, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@backend/i18n/navigation";
import { addToCartAction } from "@backend/modules/cart/actions";

/**
 * Buy buttons of a Premium pack (CLAUDE.md §5): "Add to cart" (stays on the page, toast) and "Buy now"
 * (adds, then opens the cart, where a coupon can be applied before checkout — user request 2026-11-19; guests
 * sign in when they press Checkout there). The server decides: free, hidden, owned or already-in-cart packs are
 * refused. Free packs use <FreeDownload> instead.
 */
export function PurchaseActions({ productId }: { productId: string }) {
  const t = useTranslations("productPage");
  const tc = useTranslations("cart");
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const add = (thenOpenCart: boolean) =>
    startTransition(async () => {
      let result;
      try {
        result = await addToCartAction(productId);
      } catch {
        toast({ variant: "error", title: tc("error") }); // server / network failure: never fail silently
        return;
      }
      if (result.status === "added") {
        if (thenOpenCart) router.push("/cart");
        else toast({ variant: "success", title: tc("added") });
        return;
      }
      // Buy now with the pack already in the cart: just open the cart.
      if (thenOpenCart && result.status === "blocked" && result.reason === "alreadyInCart") {
        router.push("/cart");
        return;
      }
      toast({ variant: result.reason === "alreadyInCart" ? "info" : "error", title: tc(`blocked.${result.reason}`) });
    });

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" onClick={() => add(true)} disabled={pending} className="w-full" data-testid="buy-now">
        <Zap aria-hidden="true" className="size-4" />
        {t("buyNow")}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        onClick={() => add(false)}
        disabled={pending}
        className="w-full"
        data-testid="add-to-cart"
      >
        <ShoppingCart aria-hidden="true" className="size-4" />
        {t("addToCart")}
      </Button>
    </div>
  );
}
