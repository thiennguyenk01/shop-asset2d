"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { usePathname } from "@backend/i18n/navigation";
import { FLASH_MESSAGE, takeFlash } from "@backend/lib/flash";

/** Shows the toast a server action left behind (see lib/flash.ts) on mount and after each navigation, once. */
export function FlashToast() {
  const t = useTranslations();
  const { toast } = useToast();
  const pathname = usePathname();

  useEffect(() => {
    const key = takeFlash();
    if (key) toast({ variant: "success", title: t(FLASH_MESSAGE[key]) });
  }, [pathname, t, toast]);

  return null;
}
