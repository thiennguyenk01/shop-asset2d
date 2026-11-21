import { ChevronDown, Info } from "lucide-react";
import { getMessages, getTranslations } from "next-intl/server";
import { textBlocks, type InfoPage } from "@backend/lib/info-pages";

type Section = { title: string; body: string };
type FaqGroup = { title: string; items: Record<string, { q: string; a: string }> };
type InfoMessages = { info: Record<Exclude<InfoPage, "faq">, { sections: Record<string, Section> }> & { faq: { groups: Record<string, FaqGroup> } } };

/** The section objects themselves (typed `t.raw` only takes leaf keys); the request's language, like `t`. */
async function infoMessages(): Promise<InfoMessages["info"]> {
  return ((await getMessages()) as unknown as InfoMessages).info;
}

const frame = "flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6";

/** Paragraphs and "- " lists of one message text (info-pages.ts `textBlocks`). */
function Blocks({ body }: { body: string }) {
  return textBlocks(body).map((b, i) =>
    b.kind === "ul" ? (
      <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-bronze-500">
        {b.items.map((item, j) => (
          <li key={j}>{item}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{b.text}</p>
    ),
  );
}

/** Every info page opens with this: the texts are samples until the owner has read and edited them. */
function DraftNotice({ text }: { text: string }) {
  return (
    <div role="note" data-testid="info-draft-notice" className="flex gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold-300" />
      <p className="text-sm text-pretty text-ivory-100/90">{text}</p>
    </div>
  );
}

/** About, terms, privacy, refund: an intro and titled sections. The page name in the top bar is the <h1>. */
export async function InfoArticle({ page }: { page: Exclude<InfoPage, "faq"> }) {
  const [t, info] = await Promise.all([getTranslations("info"), infoMessages()]);
  const sections = info[page].sections;
  return (
    <div className={frame} data-testid={`info-${page}`}>
      <DraftNotice text={t("draftNotice")} />
      <p className="text-base text-pretty text-ivory-100">{t(`${page}.intro`)}</p>
      {Object.entries(sections).map(([key, s]) => (
        <section key={key} aria-labelledby={`${page}-${key}`} className="flex flex-col gap-3">
          <h2 id={`${page}-${key}`} className="text-lg font-semibold text-gold-300">
            {s.title}
          </h2>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-pretty text-ivory-300">
            <Blocks body={s.body} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** FAQ: groups of questions, each a native <details> (works without JavaScript, keyboard included). */
export async function FaqList() {
  const [t, info] = await Promise.all([getTranslations("info"), infoMessages()]);
  const groups = info.faq.groups;
  return (
    <div className={frame} data-testid="info-faq">
      <DraftNotice text={t("draftNotice")} />
      <p className="text-base text-pretty text-ivory-100">{t("faq.intro")}</p>
      {Object.entries(groups).map(([key, g]) => (
        <section key={key} aria-labelledby={`faq-${key}`} className="flex flex-col gap-3">
          <h2 id={`faq-${key}`} className="text-lg font-semibold text-gold-300">
            {g.title}
          </h2>
          <div className="flex flex-col gap-2">
            {Object.entries(g.items).map(([id, item]) => (
              <details key={id} className="group rounded-xl border border-bronze-700 bg-ink-900 open:border-bronze-600">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ivory-100 transition-colors select-none hover:bg-ink-850 focus-visible:ring-2 focus-visible:ring-gold-500/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 text-pretty">{item.q}</span>
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ivory-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-3 px-4 pb-4 text-sm leading-relaxed text-pretty text-ivory-300">
                  <Blocks body={item.a} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
