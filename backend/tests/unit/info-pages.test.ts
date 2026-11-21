import { describe, expect, it } from "vitest";
import en from "../../../frontend/messages/en.json" with { type: "json" };
import vi from "../../../frontend/messages/vi.json" with { type: "json" };
import zh from "../../../frontend/messages/zh.json" with { type: "json" };
import { RESET_TTL_MINUTES } from "@backend/lib/auth/password-reset";
import { GUEST_CART_DAYS } from "@backend/lib/cron/rules";
import { DOWNLOAD_HOURLY_CAP, FREE_DOWNLOADS_PER_PACK } from "@backend/lib/download/rules";
import { INFO_PAGES, LEGAL_PAGES, textBlocks } from "@backend/lib/info-pages";
import { ORDER_TTL_MINUTES } from "@backend/lib/payment/rules";
import { RATE_LIMIT_RETENTION_HOURS } from "@backend/lib/rate-limit/rules";

/** Info pages (About, FAQ, terms, privacy, refund): sample texts that quote the shop's real rules. */
const all = { vi, en, zh };

describe("info page texts", () => {
  it("text blocks: paragraphs split on a blank line, '- ' lines become a list", () => {
    expect(textBlocks("Một.\nHai.\n\n- a\n- b\n\nBa.")).toEqual([
      { kind: "p", text: "Một. Hai." },
      { kind: "ul", items: ["a", "b"] },
      { kind: "p", text: "Ba." },
    ]);
  });

  it("every page has a title, a description, an intro and content in every language", () => {
    for (const m of Object.values(all)) {
      for (const page of INFO_PAGES) {
        expect(m.nav[page]).toBeTruthy();
        expect(m.info[page].metaDescription).toBeTruthy();
        expect(m.info[page].intro).toBeTruthy();
      }
      expect(Object.keys(m.info.faq.groups).length).toBeGreaterThan(0);
      for (const page of LEGAL_PAGES) expect(Object.keys(m.info[page].sections).length).toBeGreaterThan(0);
    }
  });

  it("the numbers quoted match the rules in the code", () => {
    for (const m of Object.values(all)) {
      const faq = m.info.faq.groups;
      const terms = m.info.terms.sections;
      const privacy = m.info.privacy.sections.collect.body;
      expect(faq.free.items.count.a).toContain(String(FREE_DOWNLOADS_PER_PACK));
      expect(faq.premium.items.ttl.a).toContain(String(ORDER_TTL_MINUTES));
      expect(faq.account.items.forgot.a).toContain(String(RESET_TTL_MINUTES));
      expect(terms.downloads.body).toContain(String(FREE_DOWNLOADS_PER_PACK));
      expect(terms.downloads.body).toContain(String(DOWNLOAD_HOURLY_CAP));
      expect(privacy).toContain(String(GUEST_CART_DAYS));
      expect(privacy).toContain(String(RATE_LIMIT_RETENTION_HOURS));
    }
  });
});
