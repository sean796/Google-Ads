import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalSeoStrategyFromGrid } from "@/lib/local-seo-strategy-from-grid";
import {
  clearMasterInstructionsTestCache,
  seedMasterInstructionsForTests,
} from "@/lib/master-instructions-storage";

describe("fetchLocalSeoStrategyFromGrid - single OpenRouter pass", () => {
  afterEach(() => {
    clearMasterInstructionsTestCache();
    vi.unstubAllGlobals();
  });

  it("uses one OpenRouter completion on the happy path (no duplicate repair)", async () => {
    const block = {
      strategyMarkdown: "- ok",
      keywordStrategyMarkdown: "# k",
      questionsByKeyword: {},
      sapRows: [
        {
          keyword: "furnace repair",
          entity: "Whyte, Edmonton, AB",
          title: "Furnace repair in Whyte",
          modifier: "",
          featuredImage: "google-maps",
        },
        {
          keyword: "furnace repair",
          entity: "Whyte, Edmonton, AB",
          title: "Furnace repair in Whyte again",
          modifier: "",
          featuredImage: "google-maps",
        },
      ],
    };
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(block) } }],
          }),
        };
      }) as unknown as typeof fetch,
    );

    const result = await fetchLocalSeoStrategyFromGrid({
      apiKey: "k",
      model: "m",
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      targetSapCount: 2,
      keywordTargets: [{ keyword: "furnace", sapPages: 2 }],
      gridSummaryMarkdown: "## Grid\nPlace: Whyte, Edmonton",
      siteName: "Site",
    });

    expect(call).toBe(1);
    expect(result.sapRows).toHaveLength(2);
  });

  it("returns empty result when the API is non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );

    const result = await fetchLocalSeoStrategyFromGrid({
      apiKey: "k",
      model: "m",
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      targetSapCount: 1,
      keywordTargets: [{ keyword: "x", sapPages: 1 }],
      gridSummaryMarkdown: "## g",
      siteName: "Site",
    });

    expect(result.sapRows).toEqual([]);
    expect(result.strategyMarkdown).toBe("-");
  });

  it("appends client master instructions to the generate system message when loaded for the site", async () => {
    const siteId = "test-generate-master-rules";
    const stubLs = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    vi.stubGlobal("localStorage", stubLs as Storage);
    vi.stubGlobal(
      "window",
      {
        location: { origin: "http://localhost" },
        localStorage: stubLs,
      } as unknown as Window,
    );
    seedMasterInstructionsForTests(siteId, {
      sources: [
        {
          name: "sap-mix.txt",
          content: "Allocate 60% SAP rows to blinds keywords and 30% to shades keywords.",
          uploadedAt: Date.now(),
        },
      ],
    });

    const okBlock = {
      strategyMarkdown: "- ok",
      keywordStrategyMarkdown: "# k",
      questionsByKeyword: {},
      sapRows: [
        {
          keyword: "custom blinds",
          entity: "Area, City, ST",
          title: "Custom blinds in Area",
          modifier: "",
          featuredImage: "google-maps",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(okBlock) } }],
        }),
      })) as unknown as typeof fetch,
    );

    await fetchLocalSeoStrategyFromGrid({
      apiKey: "k",
      model: "m",
      temperature: 0.5,
      maxTokens: 8000,
      topP: 1,
      targetSapCount: 1,
      keywordTargets: [{ keyword: "custom blinds", sapPages: 1 }],
      gridSummaryMarkdown: "## Grid\nevidence",
      siteName: "Site",
      siteId,
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      messages: { role: string; content: string }[];
    };
    const systemMsg = body.messages.find((m) => m.role === "system")?.content ?? "";
    expect(systemMsg).toContain("CLIENT MASTER INSTRUCTIONS");
    expect(systemMsg).toContain("60% SAP rows to blinds");
    expect(systemMsg).toContain("source of truth");
  });
});
