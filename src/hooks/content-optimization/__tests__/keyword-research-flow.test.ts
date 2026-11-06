import { describe, expect, it, vi, beforeEach } from "vitest";
import { performKeywordResearchFlow } from "../keyword-research-flow";
import type { WordPressSite } from "@/components/integrations/types";

vi.mock("@/lib/content-optimization-helpers", () => ({
  performKeywordResearch: vi.fn(),
  findRelatedGSCKeywords: vi.fn(() => []),
  performAIAnalysis: vi.fn(async () => ({
    keywordSuggestions: { primary: "kw", secondary: [] },
    peopleAlsoAsk: [],
    h2Sections: [],
    researchLinks: [],
  })),
  getAutoSelectHelpers: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: vi.fn(() => "test-model"),
}));

import { performKeywordResearch, performAIAnalysis } from "@/lib/content-optimization-helpers";

const site = { id: "s1", name: "Test", siteUrl: "https://example.com" } as unknown as WordPressSite;

describe("performKeywordResearchFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses SERP brief path and skips getKeywordOverview when seo_research is present", async () => {
    const brief = JSON.stringify({
      version: 1,
      focusKeyword: "blinds",
      pageUrl: "https://example.com/blinds/",
      dataforseo: {
        peopleAlsoAsk: [{ question: "Q1?", answers: [] }],
        relatedSearches: ["related"],
        peopleAlsoSearchPhrases: [],
      },
    });

    const result = await performKeywordResearchFlow(
      "blinds",
      { query: "blinds", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      { queries: [{ query: "gsc kw", clicks: 5, impressions: 50, ctr: 0.1, position: 3 }] },
      undefined,
      site,
      "s1",
      false,
      vi.fn(),
      false,
      brief,
    );

    expect(performKeywordResearch).not.toHaveBeenCalled();
    expect(performAIAnalysis).not.toHaveBeenCalled();
    expect(result.relatedKeywords).toContain("gsc kw");
    expect(result.relatedKeywords).toContain("related");
    expect(result.aiAnalysis.peopleAlsoAsk?.[0]?.question).toBe("Q1?");
  });
});
