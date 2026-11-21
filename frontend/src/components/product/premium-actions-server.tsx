import { getCurrentUser } from "@backend/auth/current-user";
import { isInLibrary } from "@backend/modules/library/service";
import { OwnedPack } from "./owned-pack";
import { PurchaseActions } from "./purchase-actions";

/**
 * Buy panel of a Premium pack, per visitor (reads the session → render inside <Suspense>): owners get
 * "You own this pack" + Download; everyone else gets Buy now / Add to cart. The server re-checks either way.
 */
export async function PremiumActionsServer({ productId }: { productId: string }) {
  const user = await getCurrentUser();
  if (user && (await isInLibrary(user.id, productId))) return <OwnedPack productId={productId} />;
  return <PurchaseActions productId={productId} />;
}
