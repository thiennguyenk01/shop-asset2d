import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { FeedbackDemo } from "@/components/design-system/feedback-demo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Container, SectionHeading } from "@/components/ui/layout-primitives";
import { OrnateFrame } from "@/components/ui/ornate-frame";
import { Seal } from "@/components/ui/seal";
import { EmptyState, ErrorState, Spinner, SuccessState } from "@/components/ui/states";
import { getEnv } from "@backend/env";

/** Internal design-system preview. Never available in production. */

const PALETTE = [
  ["ink-950", "bg-ink-950"],
  ["ink-900", "bg-ink-900"],
  ["ink-800", "bg-ink-800"],
  ["bronze-700", "bg-bronze-700"],
  ["bronze-500", "bg-bronze-500"],
  ["gold-600", "bg-gold-600"],
  ["gold-500", "bg-gold-500"],
  ["gold-300", "bg-gold-300"],
  ["cinnabar-600", "bg-cinnabar-600"],
  ["cinnabar-500", "bg-cinnabar-500"],
  ["jade-600", "bg-jade-600"],
  ["jade-400", "bg-jade-400"],
  ["ivory-100", "bg-ivory-100"],
  ["ivory-300", "bg-ivory-300"],
  ["ivory-500", "bg-ivory-500"],
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("designSystem");
  return { title: t("metaTitle"), robots: { index: false } };
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <SectionHeading title={title} align="left" />
      {children}
    </section>
  );
}

export default async function DesignSystemPage() {
  if (getEnv().APP_ENV === "production") notFound();
  const [t, tc] = await Promise.all([getTranslations("designSystem"), getTranslations("common")]);

  return (
    <Container className="flex flex-col gap-16 py-14">
      <SectionHeading as="h1" title={t("title")} description={t("intro")} />

      <Block title={t("colors")}>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {PALETTE.map(([name, cls]) => (
            <li key={name} className="flex flex-col gap-1.5">
              <span className={`h-14 rounded-md ring-1 ring-ivory-100/10 ${cls}`} />
              <code className="text-xs text-ivory-500">{name}</code>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={t("typography")}>
        <div className="flex flex-col gap-4">
          <p className="font-display text-5xl text-gold-gradient">{t("displaySample")}</p>
          <p className="font-heading text-2xl">{t("headingSample")}</p>
          <p className="text-ivory-300">{t("bodySample")}</p>
          <p className="font-display text-3xl" lang="vi">
            {t("diacriticsSample")}
          </p>
          <div className="flex items-center gap-4">
            <Seal glyphs="仙" size="sm" />
            <Seal glyphs="剑侠" size="md" />
            <Seal glyphs="仙宝阁" size="lg" />
          </div>
        </div>
      </Block>

      <Block title={t("buttons")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t("buyNow")}</Button>
          <Button variant="secondary">{t("addToCart")}</Button>
          <Button variant="jade">{t("downloadFree")}</Button>
          <Button variant="danger">{t("remove")}</Button>
          <Button variant="ghost">{t("cancel")}</Button>
          <Button size="sm">{t("buyNow")}</Button>
          <Button size="lg">{t("buyNow")}</Button>
          <Button disabled>{t("buyNow")}</Button>
        </div>
      </Block>

      <Block title={t("badges")}>
        <div className="flex flex-wrap gap-3">
          <Badge variant="free">{tc("free")}</Badge>
          <Badge variant="premium">{tc("premium")}</Badge>
          <Badge variant="demo">{tc("demo")}</Badge>
        </div>
      </Block>

      <Block title={t("frame")}>
        <OrnateFrame className="max-w-xl p-6">
          <p className="text-ivory-300">{t("frameText")}</p>
        </OrnateFrame>
      </Block>

      <Block title={t("form")}>
        <div className="flex max-w-sm flex-col gap-2">
          <label htmlFor="ds-email" className="text-sm text-ivory-300">
            {t("emailLabel")}
          </label>
          <Input id="ds-email" type="email" placeholder={t("emailPlaceholder")} />
        </div>
      </Block>

      <Block title={t("states")}>
        <Spinner label={tc("loading")} />
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState title={t("emptyTitle")} description={t("emptyText")} />
          <ErrorState title={t("errorTitle")} description={t("errorText")} />
          <SuccessState title={t("successTitle")} description={t("successText")} />
        </div>
      </Block>

      <Block title={t("feedback")}>
        <FeedbackDemo />
      </Block>
    </Container>
  );
}
