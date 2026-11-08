import { describe, expect, it } from "vitest";
import { resolveFaqEntriesForVisibleTable } from "@/lib/content-generation/bulk-post-fields-seo-bundle";
import {
  buildFaqSectionHtml,
  FLO_FAQ_CLASS,
  HARNESS_FAQ_ANCHOR_ID,
} from "@/lib/overview/overview-blog-faq-append";

describe("resolveFaqEntriesForVisibleTable", () => {
  it("uses backend in-context Q/A entries for the visible Question/Answer table", () => {
    const entries = [
      {
        question: "When will the BC PST expansion rules for businesses take effect?",
        answer: "The BC PST expansion rules for businesses take effect in 2026.",
      },
      {
        question: "What are the five new categories being added to BC PST?",
        answer: "Prepared Food and Beverages, Online Accommodation Platforms, Vape Products, Carbonated Sugar-Sweetened Beverages, and Certain Telecommunication Services.",
      },
    ];
    const resolved = resolveFaqEntriesForVisibleTable(entries);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.question).toContain("BC PST expansion");

    const html = buildFaqSectionHtml(
      resolved,
      "To help you navigate the upcoming BC PST Expansion Rules for Businesses, we've compiled answers to some of the most common questions regarding the 2026 changes.",
    );
    expect(html).toContain(`<div class="${FLO_FAQ_CLASS}">`);
    expect(html).toContain(`<h2 id="${HARNESS_FAQ_ANCHOR_ID}">FAQ</h2>`);
    expect(html).toContain("Question</th>");
    expect(html).toContain("Answer</th>");
    expect(html).toContain("When will the BC PST expansion rules for businesses take effect?</td>");
    expect(html).toContain("The BC PST expansion rules for businesses take effect in 2026.</td>");
  });

  it("returns empty when there are no backend entries (no schema fallback)", () => {
    expect(resolveFaqEntriesForVisibleTable(undefined)).toEqual([]);
    expect(resolveFaqEntriesForVisibleTable([])).toEqual([]);
    expect(resolveFaqEntriesForVisibleTable(null)).toEqual([]);
  });
});
