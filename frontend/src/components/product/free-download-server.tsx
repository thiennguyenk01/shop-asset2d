import { getLocale } from "next-intl/server";
import type { Locale } from "@backend/i18n/routing";
import { formatVnd } from "@backend/lib/format";
import { getCurrentUser } from "@backend/auth/current-user";
import { getFreeDownloadQuota } from "@backend/modules/download/service";
import { isInLibrary } from "@backend/modules/library/service";
import { isDemoMode } from "@backend/modules/payment/providers";
import { getExtraDownloadsOffer } from "@backend/modules/settings/service";
import { FreeDownload } from "./free-download";

/** Reads the session (request time) — render inside <Suspense> with FreeDownloadSkeleton as fallback. */
export async function FreeDownloadServer({
  productId,
  slug,
  title,
}: {
  productId: string;
  slug: string;
  title: string;
}) {
  const [user, locale, offer] = await Promise.all([getCurrentUser(), getLocale(), getExtraDownloadsOffer()]);
  const [inLibrary, quota] = user
    ? await Promise.all([isInLibrary(user.id, productId), getFreeDownloadQuota(user.id, productId)])
    : [false, null];
  return (
    <FreeDownload
      productId={productId}
      slug={slug}
      title={title}
      quota={quota}
      inLibrary={inLibrary}
      extra={{
        count: offer.count,
        price: formatVnd(offer.priceVnd, locale as Locale),
        isDemo: isDemoMode(),
      }}
    />
  );
}
