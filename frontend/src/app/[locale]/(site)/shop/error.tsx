"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout-primitives";
import { ErrorState } from "@/components/ui/states";

/** Shown when loading the shop fails (e.g. database unreachable). Never exposes error details. */
export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("shop");
  return (
    <Container className="py-16">
      <ErrorState
        title={t("errorTitle")}
        description={t("errorText")}
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            {t("retry")}
          </Button>
        }
      />
    </Container>
  );
}
