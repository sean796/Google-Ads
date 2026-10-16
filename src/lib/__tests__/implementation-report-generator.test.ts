import { describe, expect, it, vi, beforeEach } from "vitest";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import {
  computeImplementationReportDiff,
  generateImplementationReport,
  parseImplementationReportReasoning,
} from "@/lib/implementation-report-generator";
import { linkPipelineSectionToGeneratedFile } from "@/components/shared/bulk-details-tile-sections";

const mockCallAgentCategory = vi.fn();

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  callAgentCategoryOpenRouterChat: (...args: unknown[]) => mockCallAgentCategory(...args),
}));

describe("implementation-report-generator", () => {
  beforeEach(() => {
    mockCallAgentCategory.mockReset();
  });

  it("computes deterministic H2, word count, internal/external link, and GSC/Semrush diffs", () => {
    const seoResearchRaw = JSON.stringify({
      version: 1,
      focusKeyword: "motorized blinds",
      pageUrl: "https://example.com/motorized-blinds-guide/",
      gsc: {
        pageUrl: "https://example.com/motorized-blinds-guide/",
        queries: ["motorized blinds", "smart window shades"],
      },
      semrush: {
        urlOrganicKeywords: ["motorized blinds cost", "remote control blinds"],
        phraseRelatedKeywords: ["automated window treatments"],
        externalSemrushUrls: ["https://energy.gov/window-coverings"],
      },
      dataforseo: {
        seedKeyword: "motorized blinds",
        organic: [{ domain: "competitor.com", title: "Complete Motorized Blinds Guide", url: "https://competitor.com/guide" }],
        peopleAlsoAsk: [{ question: "Are motorized blinds worth the cost?", answers: [] }],
        peopleAlsoSearchPhrases: [],
        relatedSearches: [],
        refinementChips: [],
        popularProducts: [],
      },
    });

    const diff = computeImplementationReportDiff({
      originalTitle: "Old Blinds Post",
      newTitle: "Motorized Blinds Guide for Modern Homes",
      originalExcerpt: "Old excerpt",
      newExcerpt: "New excerpt with motorized blinds",
      originalContent: "## Introduction\nShort intro about blinds.\n\n## Old Section\nOutdated text with [Old Link](https://example.com/old-page/).",
      newContent:
        "## Answer\nDirect answer about motorized blinds.\n\n## Introduction\nExpanded intro about motorized blinds and [Smart Shades](https://example.com/smart-shades/).\n\n## Cost Breakdown\nDetailed cost breakdown citing [DOE Guide](https://energy.gov/window-coverings).",
      primaryKeyword: "motorized blinds",
      selectedKeyword: {
        query: "motorized blinds",
        clicks: 14,
        impressions: 620,
        ctr: 0.0225,
        position: 8.4,
      },
      gscResult: {
        queries: [
          { query: "motorized blinds", clicks: 14, impressions: 620, ctr: 0.0225, position: 8.4 },
          { query: "smart window shades", clicks: 4, impressions: 210, ctr: 0.019, position: 11.2 },
        ],
      },
      seoResearchRaw,
      updateMode: "update",
      url: "https://example.com/motorized-blinds-guide/",
      siteUrl: "https://example.com",
    });

    expect(diff.originalH2s.map((h) => h.h2)).toEqual(["Introduction", "Old Section"]);
    expect(diff.newH2s.map((h) => h.h2)).toEqual(["Answer", "Introduction", "Cost Breakdown"]);
    expect(diff.removedH2s.map((h) => h.h2)).toEqual(["Old Section"]);
    expect(diff.sectionDiffs.find((s) => s.h2 === "Answer")?.status).toBe("added");
    expect(diff.sectionDiffs.find((s) => s.h2 === "Introduction")?.status).toBe("rewritten");
    expect(diff.addedInternalLinks.map((l) => l.url)).toEqual(["https://example.com/smart-shades/"]);
    expect(diff.removedInternalLinks.map((l) => l.url)).toEqual(["https://example.com/old-page/"]);
    expect(diff.addedExternalLinks.map((l) => l.url)).toEqual(["https://energy.gov/window-coverings"]);
    expect(diff.gscQueries).toHaveLength(2);
    expect(diff.semrushOrganicKeywords).toEqual(["motorized blinds cost", "remote control blinds"]);
  });

  it("generates Director-reasoned implementation-report-{slug}.md and links to Implementation report stage", async () => {
    mockCallAgentCategory.mockResolvedValueOnce({
      raw: {},
      content: JSON.stringify({
        executiveSummary:
          "We restructured the motorized blinds article to capture position 8.4 GSC impressions and high-intent Semrush cost queries.",
        whyOptimized:
          "The original post lacked a direct answer block and missed pricing coverage demanded by Semrush and SERP People Also Ask queries.",
        gscAndSemrushStrategy:
          "Targeted 'motorized blinds' (620 impressions, pos 8.4) and Semrush 'motorized blinds cost' by adding dedicated Answer and Cost Breakdown sections.",
        sectionRationale: [
          {
            h2: "Answer",
            status: "added",
            whatChanged: "Added direct 60-word opening answer block.",
            whyChanged: "Captures AI Overview and featured snippet intent.",
            dataSignalsUsed: "GSC query 'motorized blinds' (620 impressions)",
          },
          {
            h2: "Cost Breakdown",
            status: "added",
            whatChanged: "Added pricing comparison section with DOE external citation.",
            whyChanged: "Addresses buyer cost comparison intent.",
            dataSignalsUsed: "Semrush 'motorized blinds cost' + PAA 'Are motorized blinds worth the cost?'",
          },
        ],
        bossHighlights: [
          "Targeted 620 GSC impressions at position 8.4 for 'motorized blinds'.",
          "Added 2 new H2 sections aligned with Semrush cost and PAA queries.",
          "Wove 1 new internal product link and 1 DOE authority citation.",
        ],
      }),
    });

    const fm = new OptimizationFileManager();
    const md = await generateImplementationReport(
      {
        originalTitle: "Old Blinds Post",
        newTitle: "Motorized Blinds Guide",
        originalExcerpt: "",
        newExcerpt: "",
        originalContent: "## Old Section\nOld text.",
        newContent: "## Answer\nNew direct answer.\n\n## Cost Breakdown\nCost details.",
        primaryKeyword: "motorized blinds",
        selectedKeyword: {
          query: "motorized blinds",
          clicks: 14,
          impressions: 620,
          ctr: 0.0225,
          position: 8.4,
        },
        faqEntries: [{ question: "Are motorized blinds worth the cost?" }],
        updateMode: "update",
        url: "https://example.com/motorized-blinds-guide/",
        siteId: "site-1",
        siteUrl: "https://example.com",
        apiKey: "test-or-key",
      },
      fm,
    );

    expect(mockCallAgentCategory).toHaveBeenCalledTimes(1);
    expect(mockCallAgentCategory.mock.calls[0]?.[0]).toMatchObject({
      category: "research",
      siteId: "site-1",
      reasoning: { effort: "low" },
      responseFormat: { type: "json_object" },
    });

    expect(md).toContain("## Director Executive Summary (For Management)");
    expect(md).toContain("## Why This Blog Was Optimized");
    expect(md).toContain("## How GSC & Semrush Data Guided the Optimization");
    expect(md).toContain("## H2 Section-by-Section Changes & Director Rationale");
    expect(md).toContain("Are motorized blinds worth the cost?");

    const files = fm.getFiles();
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("implementation-report-motorized-blinds-guide.md");

    const linked = linkPipelineSectionToGeneratedFile(
      { sectionIndex: 5, title: "Implementation report", status: "done" },
      files,
    );
    expect(linked?.name).toBe("implementation-report-motorized-blinds-guide.md");
  });

  it("validates reasoning JSON shape strictly", () => {
    expect(() => parseImplementationReportReasoning("{}")).toThrow(
      /missing required summary fields/i,
    );
  });
});
