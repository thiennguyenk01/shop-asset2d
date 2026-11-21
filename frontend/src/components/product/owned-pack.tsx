"use client";

import { CheckCircle2, Download, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDownload } from "@/components/download/use-download";
import { Button } from "@/components/ui/button";
import { Link } from "@backend/i18n/navigation";

/** A Premium pack the signed-in user already owns: no buy buttons — download it, or open the library. */
export function OwnedPack({ productId }: { productId: string }) {
  const t = useTranslations("productPage");
  const tl = useTranslations("library");
  const td = useTranslations("download");
  const { download, pending } = useDownload();
  return (
    <div className="flex flex-col gap-2" data-testid="owned-pack">
      <p className="flex items-center gap-2 text-sm font-medium text-ivory-100">
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-jade-400" />
        {t("owned")}
      </p>
      <Button
        size="lg"
        variant="jade"
        className="w-full"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => download(productId)}
        data-testid="owned-download"
      >
        <Download aria-hidden="true" className="size-4" />
        {pending ? td("preparing") : tl("download")}
      </Button>
      <Button asChild size="lg" variant="secondary" className="w-full">
        <Link href="/library">
          <Library aria-hidden="true" className="size-4" />
          {td("openLibrary")}
        </Link>
      </Button>
      <p className="text-xs text-pretty text-ivory-500">{t("ownedNote")}</p>
    </div>
  );
}
