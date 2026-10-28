import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BulkProcessingOptions } from "@/lib/bulk-auto-generate";
import { generateRowOutputs } from "@/lib/bulk-auto-generate";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { KeywordAnalysisComplete } from "@/lib/keyword-types";

const analyzeBulkCsvKeywordMock = vi.fn();

vi.mock("@/lib/bulk/bulk-csv-keyword-analyze", () => ({
  analyzeBulkCsvKeyword: (...args: unknown[]) => analyzeBulkCsvKeywordMock(...args),
  applyCsvPrimaryKeywordToResearch: (
    research: KeywordAnalysisComplete,
    csvKeyword: string,
  ) => ({
    ...research,
    result: {
      ...research.result,
      primaryKeyword: csvKeyword,
      keywordData: { ...research.result.keywordData, keyword: csvKeyword },
    },
  }),
}));

describe("bulk CSV keyword research", () => {
  const row: CSVRow = {
    keyword: "Hunter Douglas warranty",
    title: "Hunter Douglas Warranty Policy Explained",
  };

  const options = {
    apiKey: "test",
    openRouterApiKey: "test",
    onProgress: vi.fn(),
  } as BulkProcessingOptions;

  beforeEach(() => {
    analyzeBulkCsvKeywordMock.mockReset();
  });

  it("uses CSV keyword when parallel analyzer returns data", async () => {
    const fileManager = new BulkFileManager();
    analyzeBulkCsvKeywordMock.mockResolvedValue({
      result: {
        primaryKeyword: "Hunter Douglas warranty",
        keywordData: {
          keyword: "Hunter Douglas warranty",
          difficulty: 10,
          searchVolume: 100,
          cpc: 1,
          competition: "LOW",
          intent: "informational",
          relatedKeywords: [],
          serpFeatures: [],
        },
        semanticKeywords: [],
        searchIntent: "informational",
      },
      aiAnalysis: {
        keywordSuggestions: { primary: "Hunter Douglas warranty", variations: [], longTail: [], semantic: [] },
        h2Suggestions: [],
        contentGaps: [],
        peopleAlsoAsk: [],
        researchLinks: [],
      },
      keywordsVolumeData: [],
      paaRawResponse: { tasks: [] },
    });

    const { research } = await generateRowOutputs(
      0,
      row,
      options,
      fileManager,
      vi.fn(),
    );

    expect(research?.result.primaryKeyword).toBe("Hunter Douglas warranty");
    expect(research?.result.keywordData.keyword).toBe("Hunter Douglas warranty");
    expect(analyzeBulkCsvKeywordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryKeyword: "Hunter Douglas warranty",
        options: expect.objectContaining({ language: "en" }),
      }),
    );
  });

  it("propagates when parallel analyzer throws", async () => {
    const fileManager = new BulkFileManager();
    analyzeBulkCsvKeywordMock.mockRejectedValue(new Error("MCP timeout"));

    await expect(
      generateRowOutputs(0, row, options, fileManager, vi.fn()),
    ).rejects.toThrow("MCP timeout");
  });
});
