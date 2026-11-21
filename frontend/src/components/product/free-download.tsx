"use client";

import { BellRing, Check, Download, Library, Ticket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { BuyDownloadsButton, type ExtraDownloadsOffer } from "@/components/download/buy-downloads-button";
import { useDownload } from "@/components/download/use-download";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Seal } from "@/components/ui/seal";
import { Link, useRouter } from "@backend/i18n/navigation";
import { FREE_DOWNLOADS_PER_PACK } from "@backend/lib/download/rules";

/** Query flag set by the invite box: after signing in, the pack page starts the download by itself. */
export const AUTO_DOWNLOAD_PARAM = "download";

const PERKS = [
  { key: "library", Icon: Library },
  { key: "quota", Icon: Ticket },
  { key: "updates", Icon: BellRing },
] as const;

export type FreeQuotaView = { left: number; total: number };

/**
 * "Tải miễn phí" (CLAUDE.md §5, decision 2026-11-14 "giới hạn lượt tải"): every download needs an account,
 * and each account downloads a free pack FREE_DOWNLOADS_PER_PACK times.
 * - Guest: an invite box — sign in / create an account, then come back here and the download starts.
 * - Signed in with downloads left: download; the first one saves the pack to the library (FREE_CLAIM).
 * - None left: say so and offer more downloads for this pack (step 4.6: confirm box → payment gateway).
 * The server re-checks all of it on every click.
 */
export function FreeDownload({
  productId,
  slug,
  title,
  quota,
  inLibrary,
  extra,
}: {
  productId: string;
  slug: string;
  title: string;
  /** null = not signed in. */
  quota: FreeQuotaView | null;
  inLibrary: boolean;
  /** The "buy more downloads" offer (step 4.6): how many, the formatted price, demo mode. */
  extra: ExtraDownloadsOffer;
}) {
  const t = useTranslations("download");
  const tp = useTranslations("productPage");
  const tc = useTranslations("common");
  const { download, pending } = useDownload();
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoStarted = useRef(false);
  const signedIn = quota !== null;
  const exhausted = signedIn && quota.left === 0;

  // Back from "sign in to download": start once, and drop the flag so a reload does not repeat it.
  useEffect(() => {
    if (autoStarted.current || !signedIn || searchParams.get(AUTO_DOWNLOAD_PARAM) !== "1") return;
    autoStarted.current = true;
    router.replace(`/product/${slug}`, { scroll: false });
    if (!exhausted) download(productId);
  }, [signedIn, exhausted, searchParams, router, slug, productId, download]);

  const back = `/product/${slug}?${AUTO_DOWNLOAD_PARAM}=1`;

  const libraryNote = inLibrary ? (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ivory-300" data-testid="in-library">
      <Check aria-hidden="true" className="size-3.5 shrink-0 text-jade-400" />
      {t("inLibrary")}
      <Link href="/library" className="font-medium text-gold-300 underline-offset-2 hover:underline">
        {t("openLibrary")}
      </Link>
    </p>
  ) : null;

  if (exhausted) {
    return (
      <div className="flex flex-col gap-3" data-testid="download-exhausted">
        <div className="flex flex-col gap-1.5 rounded-xl border border-bronze-700 bg-ink-950/40 p-4">
          <p className="text-sm font-semibold text-ivory-100">{t("exhausted.title", { total: quota.total })}</p>
          <p className="text-xs text-pretty text-ivory-300">{t("exhausted.text", { count: extra.count })}</p>
        </div>
        <BuyDownloadsButton productId={productId} title={title} offer={extra} size="lg" />
        {libraryNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        variant="jade"
        className="w-full"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => (signedIn ? download(productId) : setOpen(true))}
        data-testid="download-free"
      >
        <Download aria-hidden="true" className="size-4" />
        {pending ? t("preparing") : tp("downloadFree")}
      </Button>

      {signedIn ? (
        <>
          <p
            className="flex items-center gap-1.5 text-xs font-medium text-ivory-100 tabular-nums"
            data-testid="downloads-left"
          >
            <Ticket aria-hidden="true" className="size-3.5 shrink-0 text-gold-400" />
            {t("quota", { left: quota.left, total: quota.total })}
          </p>
          {libraryNote ?? <p className="text-xs text-pretty text-ivory-500">{t("willSave")}</p>}
        </>
      ) : (
        <p className="text-xs text-pretty text-ivory-500">{tp("freeNote", { count: FREE_DOWNLOADS_PER_PACK })}</p>
      )}

      {!signedIn && (
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={t("invite.title")}
          description={t("invite.description")}
          closeLabel={tc("close")}
          className="max-w-md"
        >
          <div className="flex flex-col gap-5" data-testid="download-invite">
            <div className="flex items-center gap-4 rounded-xl border border-bronze-700 bg-ink-950/40 p-4">
              <span className="hidden sm:block">
                <Seal glyphs="宝阁" size="md" />
              </span>
              <ul className="flex min-w-0 flex-col gap-3">
                {PERKS.map(({ key, Icon }) => (
                  <li key={key} className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-ivory-100">
                        {t(`invite.perks.${key}.title`, { count: FREE_DOWNLOADS_PER_PACK })}
                      </span>
                      <span className="text-xs text-pretty text-ivory-500">
                        {t(`invite.perks.${key}.text`, { count: FREE_DOWNLOADS_PER_PACK })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild size="lg" className="w-full">
                <Link href={{ pathname: "/login", query: { callbackUrl: back } }} data-testid="invite-sign-in">
                  {t("invite.signIn")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="w-full">
                <Link href={{ pathname: "/register", query: { callbackUrl: back } }} data-testid="invite-register">
                  {t("invite.register")}
                </Link>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Static stand-in while the session is read (same size, not clickable). */
export function FreeDownloadSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" variant="jade" className="w-full" disabled>
        <Download aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <div aria-hidden="true" className="h-4 w-3/4 animate-pulse rounded bg-ink-800" />
    </div>
  );
}
