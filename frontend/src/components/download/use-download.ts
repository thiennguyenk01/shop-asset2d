"use client";

import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { requestDownloadAction } from "@backend/modules/download/actions";

/**
 * Ask the server for a download and start it (CLAUDE.md §7). The server checks everything and answers
 * with a ~60 s signed URL that is used once, right here, and never kept or rendered into the page.
 * The response is an attachment, so the browser saves the file and the page stays where it is.
 */
function startFileDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = ""; // name comes from Content-Disposition
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function useDownload() {
  const t = useTranslations("download");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const download = useCallback(
    (productId: string, fileId?: string) =>
      startTransition(async () => {
        let result;
        try {
          result = await requestDownloadAction(productId, fileId);
        } catch {
          toast({ variant: "error", title: t("error") }); // server / network failure: never fail silently
          return;
        }
        if (result.status === "blocked") {
          toast({ variant: result.reason === "rateLimited" || result.reason === "quotaExhausted" ? "info" : "error", title: t(`blocked.${result.reason}`) });
          return;
        }
        startFileDownload(result.url);
        toast({
          variant: "success",
          title: result.claimed ? t("saved") : t("started"),
          // Free packs: how many downloads are left (Premium is unlimited, nothing to say).
          description: result.remaining === null ? undefined : t("left", { count: result.remaining }),
        });
      }),
    [t, toast],
  );

  return { download, pending };
}
