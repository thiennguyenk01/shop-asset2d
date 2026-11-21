import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout-primitives";
import { Seal } from "@/components/ui/seal";
import { Link } from "@backend/i18n/navigation";

/** The localized "not found" message (used inside the store shell by both 404 boundaries). */
export function NotFoundContent() {
  const t = useTranslations("notFound");
  return (
    <Container className="flex flex-col items-center gap-5 py-24 text-center">
      <Seal glyphs="幻" size="lg" />
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-ivory-300">{t("description")}</p>
      <Button asChild variant="secondary">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </Container>
  );
}
