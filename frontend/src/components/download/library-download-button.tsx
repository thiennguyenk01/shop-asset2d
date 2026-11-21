"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDownload } from "./use-download";

/** "Tải xuống" on a library row. The server re-checks ownership and downloads left on every click. */
export function LibraryDownloadButton({ productId, title }: { productId: string; title: string }) {
  const t = useTranslations("library");
  const td = useTranslations("download");
  const { download, pending } = useDownload();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={t("downloadPack", { title })}
      onClick={() => download(productId)}
      data-testid="library-download"
    >
      <Download aria-hidden="true" className="size-4" />
      {pending ? td("preparing") : t("download")}
    </Button>
  );
}
