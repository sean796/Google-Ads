import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ loadApiKey: () => "test-key" }));
vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test/research-model",
}));
vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  classifyCompetitorKeywordsWithAi,
  filterEnrichmentWithAiClassifier,
} from "../competitor-keyword-ai-classify";
import type { CompetitorResearchSemrushResponse } from "../types";

const mockChat = vi.mocked(callOpenRouterChatCompletion);

beforeEach(() => {
  mockChat.mockReset();
});

const ctx = { seedDomain: "blindmagic.com", seedKeywordPhrases: ["blinds", "window coverings"] };

describe("classifyCompetitorKeywordsWithAi", () => {
  it("returns verdicts keyed by domain and phrase", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [
          { domain: "rivalblinds.com", phrase: "rival blinds", verdict: "rival-brand" },
          { domain: "rivalblinds.com", phrase: "blinds near me", verdict: "keep" },
        ],
      }),
    });

    const out = await classifyCompetitorKeywordsWithAi({
      ...ctx,
      items: [
        { domain: "rivalblinds.com", phrase: "rival blinds" },
        { domain: "rivalblinds.com", phrase: "blinds near me" },
      ],
    });
    expect(out.get("rivalblinds.com\nrival blinds")).toBe("rival-brand");
    expect(out.get("rivalblinds.com\nblinds near me")).toBe("keep");
  });

  it("throws visibly on malformed JSON instead of passing keywords through", async () => {
    mockChat.mockResolvedValue({ raw: null, content: "nope" });
    await expect(
      classifyCompetitorKeywordsWithAi({ ...ctx, items: [{ domain: "a.com", phrase: "blinds" }] }),
    ).rejects.toThrow(/invalid JSON/i);
  });

  it("throws visibly when the model omits an item", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [{ domain: "a.com", phrase: "blinds", verdict: "keep" }],
      }),
    });
    await expect(
      classifyCompetitorKeywordsWithAi({
        ...ctx,
        items: [
          { domain: "a.com", phrase: "blinds" },
          { domain: "a.com", phrase: "shutters" },
        ],
      }),
    ).rejects.toThrow(/omitted keyword/i);
  });
});

describe("filterEnrichmentWithAiClassifier", () => {
  it("drops rival-brand and off-topic rows, keeps relevant rows", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [
          { domain: "rivalblinds.com", phrase: "rival blinds", verdict: "rival-brand" },
          { domain: "rivalblinds.com", phrase: "blinds near me", verdict: "keep" },
          { domain: "rivalblinds.com", phrase: "plumbing supplies", verdict: "off-topic" },
        ],
      }),
    });

    const enrichment: CompetitorResearchSemrushResponse["enrichmentByDomain"] = {
      "rivalblinds.com": {
        topKeywords: [
          { phrase: "rival blinds", volume: 10, traffic: 5, position: 1 },
          { phrase: "blinds near me", volume: 100, traffic: 50, position: 3 },
          { phrase: "plumbing supplies", volume: 90, traffic: 40, position: 2 },
        ],
      },
    };

    const out = await filterEnrichmentWithAiClassifier(enrichment, ctx);
    expect(out?.["rivalblinds.com"]?.topKeywords?.map((r) => r.phrase)).toEqual(["blinds near me"]);
  });

  it("surfaces classifier failure instead of returning unfiltered keywords", async () => {
    mockChat.mockRejectedValue(new Error("hub chat 500"));
    const enrichment: CompetitorResearchSemrushResponse["enrichmentByDomain"] = {
      "rivalblinds.com": {
        topKeywords: [{ phrase: "blinds near me", volume: 100, traffic: 50, position: 3 }],
      },
    };
    await expect(filterEnrichmentWithAiClassifier(enrichment, ctx)).rejects.toThrow(/hub chat 500/);
  });
});
