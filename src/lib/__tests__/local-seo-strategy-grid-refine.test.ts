import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalSeoStrategyFromGrid } from "@/lib/local-seo-strategy-from-grid";

describe("fetchLocalSeoStrategyFromGrid - refineSapRowKeywordsWithRag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls OpenRouter twice when refine is enabled and merges refined keyword only", async () => {
    const draftRows = [
      {
        keyword: "Solar Aldergrove",
        entity: "Metro Core, Edmonton, AB",
        title: "Solar Aldergrove in Metro Core",
        modifier: "",
        featuredImage: "google-maps",
      },
    ];
    const firstJson = JSON.stringify({
      strategyMarkdown: "- bullet",
      keywordStrategyMarkdown: "# Keyword strategy\n",
      questionsByKeyword: {},
      sapRows: draftRows,
    });
    const secondJson = JSON.stringify({
      sapRows: [
        {
          keyword: "Solar Panel Repair",
          entity: "ignored",
          title: "Solar Panel Repair in Metro Core Edmonton",
        },
      ],
    });

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        const content = call === 1 ? firstJson : secondJson;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content } }],
          }),
        };
      }) as unknown as typeof fetch
    );

    const result = await fetchLocalSeoStrategyFromGrid({
      apiKey: "k",
      model: "m",
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      targetSapCount: 1,
      keywordTargets: [{ keyword: "solar", sapPages: 1 }],
      gridSummaryMarkdown: "## Grid\nEvidence",
      siteName: "Site",
      refineSapRowKeywordsWithRag: true,
    });

    expect(call).toBe(2);
    expect(result.sapRows).toHaveLength(1);
    expect(result.sapRows[0]?.keyword).toBe("Solar Panel Repair");
    expect(result.sapRows[0]?.title).toBe("");
  });

  it("skips the refine pass when proposalKeywordMode is true", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    strategyMarkdown: "- x",
                    keywordStrategyMarkdown: "# Keyword strategy\n",
                    questionsByKeyword: {},
                    sapRows: [
                      {
                        keyword: "matrix kw",
                        entity: "Park, Edmonton, AB",
                        title: "matrix kw in Park Edmonton",
                        modifier: "",
                        featuredImage: "google-maps",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      }) as unknown as typeof fetch
    );

    await fetchLocalSeoStrategyFromGrid({
      apiKey: "k",
      model: "m",
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      targetSapCount: 1,
      keywordTargets: [{ keyword: "matrix kw", sapPages: 1 }],
      gridSummaryMarkdown: "## Grid\nEvidence",
      siteName: "Site",
      proposalKeywordMode: true,
      refineSapRowKeywordsWithRag: true,
    });

    expect(call).toBe(1);
  });
});
