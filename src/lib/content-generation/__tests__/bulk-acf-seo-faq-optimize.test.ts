import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOptimizeFaqToHarnessHtml,
  buildPostMarkdownAcfSeoFaqBundle,
} from "@/lib/content-generation/bulk-acf-seo-bundle";
import { FLO_FAQ_CLASS } from "@/lib/overview/overview-blog-faq-append";
import type { WordPressSite } from "@/components/integrations/types";

vi.mock("@/lib/content-generation/bulk-faq-in-context", () => ({
  generateBulkFaqEntriesInContext: vi.fn(),
  napLocationsFromSite: vi.fn(() => []),
}));

vi.mock("@/lib/overview/overview-blog-faq-intro-agent", () => ({
  generateFaqIntroParagraph: vi.fn(async () => "Intro paragraph for FAQ section."),
}));

import { generateBulkFaqEntriesInContext } from "@/lib/content-generation/bulk-faq-in-context";

const site = { id: "s1", siteUrl: "https://example.com" } as WordPressSite;

describe("buildPostMarkdownAcfSeoFaqBundle forceRegenerateFaq", () => {
  beforeEach(() => {
    vi.mocked(generateBulkFaqEntriesInContext).mockReset();
  });

  it("skips enrichedRow.faq when forceRegenerateFaq is true", async () => {
    vi.mocked(generateBulkFaqEntriesInContext).mockResolvedValue([
      { question: "Fresh Q1?", answer: "Fresh A1." },
      { question: "Fresh Q2?", answer: "Fresh A2." },
    ]);

    const bundle = await buildPostMarkdownAcfSeoFaqBundle({
      preBlogSkeleton: { primary_keyword: "solar" },
      markdownContent: "# Solar article body",
      enrichedRow: {
        title: "Solar",
        keyword: "solar",
        faq: "Q: Old question?\nA: Old answer.",
      } as import("@/lib/bulk/bulk-csv-parser").CSVRow,
      keywordData: {
        keyword: "solar",
        searchVolume: 100,
        difficulty: 10,
        cpc: 1,
        competition: "LOW",
        intent: "informational",
        relatedKeywords: [],
        serpFeatures: [],
      },
      blueprintTitle: "Solar",
      excerpt: "Meta",
      site,
      postTitle: "Solar",
      primaryKw: "solar",
      rankMeta: {},
      openRouterApiKey: "test-key",
      placeholderPostUrl: "https://example.com/solar/",
      forceRegenerateFaq: true,
    });

    expect(generateBulkFaqEntriesInContext).toHaveBeenCalled();
    expect(bundle?.faqEntries?.[0]?.question).toBe("Fresh Q1?");
    expect(bundle?.faqForAcf).toContain("application/ld+json");
  });
});

describe("applyOptimizeFaqToHarnessHtml", () => {
  beforeEach(() => {
    vi.mocked(generateBulkFaqEntriesInContext).mockReset();
  });

  it("appends flo-faq table and returns schema bundle", async () => {
    vi.mocked(generateBulkFaqEntriesInContext).mockResolvedValue([
      { question: "How much does solar cost?", answer: "It varies by system size." },
      { question: "What is payback?", answer: "Depends on usage and export." },
    ]);

    const { html, faqBundle } = await applyOptimizeFaqToHarnessHtml({
      htmlContent: "<h2>Answer</h2><p>Direct answer.</p>",
      markdownContent: "## Answer\n\nDirect answer.",
      site,
      primaryKw: "solar panels edmonton",
      postTitle: "Solar Panels Edmonton",
      excerpt: "",
      apiKey: "test-key",
      postUrl: "https://example.com/solar-panels/",
    });

    expect(html.toLowerCase()).toContain(`class="${FLO_FAQ_CLASS}"`);
    expect(html).toContain("Question</th>");
    expect(html).toContain("How much does solar cost?");
    expect(faqBundle?.faqForAcf).toContain("FAQPage");
  });

  it("throws when FAQ generation returns no entries", async () => {
    vi.mocked(generateBulkFaqEntriesInContext).mockResolvedValue([]);

    await expect(
      applyOptimizeFaqToHarnessHtml({
        htmlContent: "<p>Body</p>",
        markdownContent: "Body",
        site,
        primaryKw: "solar",
        postTitle: "Solar",
        excerpt: "",
        apiKey: "test-key",
        postUrl: "https://example.com/solar/",
      }),
    ).rejects.toThrow(/no Q\/A pairs/);
  });
});
