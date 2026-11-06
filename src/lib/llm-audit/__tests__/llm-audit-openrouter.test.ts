import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LLM_AUDIT_OPENROUTER_LABEL,
  LLM_AUDIT_OPENROUTER_MODEL,
  fetchLlmAuditOpenRouter,
  fetchLlmAuditOpenRouterWithQfo,
} from "@/lib/llm-audit/llm-audit-openrouter";
import { LLM_AUDIT_SYSTEM_MESSAGE } from "@/lib/llm-audit/llm-audit-prompts";
import { TOPIC_RESEARCH_FANOUT_CITY_REQUIRED } from "@/lib/content-optimization/topic-research-fanout";
import { LLM_AUDIT_QFO_QUERY_CONCURRENCY } from "@/lib/overview/overview-research-batch-constants";

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(),
}));

vi.mock("@/lib/openrouter-app-api", () => ({
  postOpenRouterAppChat: vi.fn(),
}));

vi.mock("@/lib/content-optimization/topic-research-fanout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/content-optimization/topic-research-fanout")>();
  return {
    ...actual,
    planTopicResearchQueries: vi.fn(),
    extractIllustrativeExample: vi.fn().mockResolvedValue({
      leadIn: "Hypothetical scenario:",
      quoteBody: "Example narrative",
      asOf: "August 2026",
      personaName: "Casey",
      scenarioNarrative: "Casey weighs one purchase decision.",
      recommendationParagraph: "Ridgeline Solar would quote the right tier.",
    }),
    runFactualVerificationPass: vi.fn().mockResolvedValue({
      factualVerificationQueries: [],
      verifiedFacts: [],
      verificationSerpRows: [],
    }),
  };
});

import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { planTopicResearchQueries, runFactualVerificationPass, extractIllustrativeExample } from "@/lib/content-optimization/topic-research-fanout";

describe("fetchLlmAuditOpenRouter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOpenRouterApiKeyForHarness).mockResolvedValue("test-or-key");
  });

  it("calls OpenRouter search-preview model with audit prompts", async () => {
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "- Winter snow load affects panel tilt https://example.com/solar",
      raw: { choices: [{ message: { content: "- fact https://example.com/solar" } }] },
    });

    const brief = await fetchLlmAuditOpenRouter({
      keyword: "solar panel costs",
      siteUrl: "https://example.com/solar",
      location: "Edmonton, AB",
    });

    expect(postOpenRouterAppChat).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-or-key",
        model: LLM_AUDIT_OPENROUTER_MODEL,
        maxTokens: 2048,
        temperature: 0.5,
        system: expect.stringContaining(LLM_AUDIT_SYSTEM_MESSAGE),
        user: expect.stringContaining("solar panel costs"),
      }),
    );
    expect(brief.platforms).toHaveLength(1);
    expect(brief.platforms[0]?.status).toBe("ok");
    expect(brief.platforms[0]?.label).toBe(LLM_AUDIT_OPENROUTER_LABEL);
    expect(brief.platforms[0]?.liveLinks).toContain("https://example.com/solar");
  });

  it("asks for housing and building facts tied to the place entity", async () => {
    expect(LLM_AUDIT_SYSTEM_MESSAGE).toContain("housing era or style");
    expect(LLM_AUDIT_SYSTEM_MESSAGE).toContain("named place entity");
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "- Bungalow stock https://example.com/housing",
      raw: {},
    });
    await fetchLlmAuditOpenRouter({
      keyword: "solar panel costs",
      siteUrl: "https://example.com/solar",
      location: "Ben Hill, Atlanta",
    });
    expect(postOpenRouterAppChat).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("housing era or style"),
      }),
    );
  });

  it("returns error platform when OpenRouter throws", async () => {
    vi.mocked(postOpenRouterAppChat).mockRejectedValue(new Error("OpenRouter 429"));

    const brief = await fetchLlmAuditOpenRouter({
      keyword: "solar",
      siteUrl: "https://example.com",
    });

    expect(brief.platforms[0]?.status).toBe("error");
    expect(brief.platforms[0]?.error).toContain("429");
  });

  it("passes an abort timeout signal to OpenRouter chat", async () => {
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "Solar installer detail https://example.com/a",
      raw: {},
    });

    await fetchLlmAuditOpenRouter({
      keyword: "solar installer",
      siteUrl: "https://example.com",
    });

    expect(postOpenRouterAppChat).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns error platform when content is empty", async () => {
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "   ",
      raw: {},
    });

    const brief = await fetchLlmAuditOpenRouter({
      keyword: "solar",
      siteUrl: "https://example.com",
    });

    expect(brief.platforms[0]?.status).toBe("error");
    expect(brief.platforms[0]?.error).toContain("empty");
  });
});

describe("fetchLlmAuditOpenRouterWithQfo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOpenRouterApiKeyForHarness).mockResolvedValue("test-or-key");
    vi.mocked(runFactualVerificationPass).mockResolvedValue({
      factualVerificationQueries: [],
      verifiedFacts: [],
      verificationSerpRows: [],
    });
  });

  it("does not run a raw keyword seed audit; only localized planner queries", async () => {
    vi.mocked(planTopicResearchQueries).mockResolvedValue({
      researchQueries: [
        "How long do solar panels stay efficient in Edmonton winters?",
        "What payback should I expect on a 10 kW system in Edmonton, AB?",
      ],
      namedPrograms: [],
      plannerModel: "google/gemini-2.5-flash-lite",
      plannedAt: "2026-08-27T19:00:00.000Z",
      researchAsOf: "August 2026",
      illustrativeExampleQuery: "example query",
      programStatusQuery: "program status query",
    });
    vi.mocked(postOpenRouterAppChat).mockResolvedValue({
      content: "- Local detail https://example.com/a",
      raw: {},
    });

    const site = {
      id: "1",
      name: "Ridgeline Solar",
      siteUrl: "https://ridgelinesolar.ca",
      username: "u",
      appPassword: "p",
      connectedAt: 0,
      locations: [{ id: "l1", name: "HQ", address: "", city: "Edmonton", state: "AB", zip: "", phone: "", isDefault: true }],
    };

    const result = await fetchLlmAuditOpenRouterWithQfo({
      keyword: "solar panel efficiency",
      siteUrl: "https://ridgelinesolar.ca/solar-panel-efficiency/",
      site,
      companyName: "Ridgeline Solar",
      title: "Solar Panel Efficiency",
    });

    expect(planTopicResearchQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "solar panel efficiency",
        companyName: "Ridgeline Solar",
        location: "Edmonton, AB",
        siteId: "1",
        pageUrl: "https://ridgelinesolar.ca/solar-panel-efficiency/",
        title: "Solar Panel Efficiency",
      }),
    );
    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(2);
    expect(result.llmAudit.platforms.every((p) => !p.label?.startsWith("Seed:"))).toBe(true);
    expect(result.llmAudit.platforms.map((p) => p.label)).toEqual([
      "How long do solar panels stay efficient in Edmonton winters?",
      "What payback should I expect on a 10 kW system in Edmonton, AB?",
    ]);
    expect(result.llmAudit.location).toBe("Edmonton, AB");
    expect(result.queryFanout?.queries).toHaveLength(2);
    expect(result.queryFanout?.plannerModel).toBe("google/gemini-2.5-flash-lite");
    expect(result.queryFanout?.researchAsOf).toBe("August 2026");
    expect(result.queryFanout?.illustrativeExampleQuery).toBe("example query");
    expect(result.queryFanout?.programStatusQuery).toBe("program status query");
    expect(extractIllustrativeExample).toHaveBeenCalledWith(
      expect.objectContaining({
        illustrativeExampleQuery: "example query",
        keyword: "solar panel efficiency",
        location: "Edmonton, AB",
        companyName: "Ridgeline Solar",
      }),
    );
  });

  it("runs QFO queries with bounded parallel OpenRouter calls", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(planTopicResearchQueries).mockResolvedValue({
      researchQueries: ["Q1 Edmonton?", "Q2 Edmonton?", "Q3 Edmonton?", "Q4 Edmonton?"],
      namedPrograms: [],
      plannerModel: "google/gemini-2.5-flash-lite",
      plannedAt: "2026-08-27T19:00:00.000Z",
      researchAsOf: "August 2026",
    });
    vi.mocked(postOpenRouterAppChat).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return { content: "- Local detail https://example.com/a", raw: {} };
    });

    const site = {
      id: "1",
      name: "Ridgeline Solar",
      siteUrl: "https://ridgelinesolar.ca",
      username: "u",
      appPassword: "p",
      connectedAt: 0,
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Edmonton",
          state: "AB",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    };

    const result = await fetchLlmAuditOpenRouterWithQfo({
      keyword: "solar panel efficiency",
      siteUrl: "https://ridgelinesolar.ca/solar-panel-efficiency/",
      site,
      companyName: "Ridgeline Solar",
    });

    expect(postOpenRouterAppChat).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(LLM_AUDIT_QFO_QUERY_CONCURRENCY);
    expect(result.llmAudit.platforms).toHaveLength(4);
    expect(result.llmAudit.platforms.map((p) => p.label)).toEqual([
      "Q1 Edmonton?",
      "Q2 Edmonton?",
      "Q3 Edmonton?",
      "Q4 Edmonton?",
    ]);
  });

  it("fails fast when the site has no city instead of querying the raw keyword", async () => {
    const result = await fetchLlmAuditOpenRouterWithQfo({
      keyword: "solar panel efficiency",
      siteUrl: "https://ridgelinesolar.ca/solar-panel-efficiency/",
      site: {
        id: "1",
        name: "Ridgeline Solar",
        siteUrl: "https://ridgelinesolar.ca",
        username: "u",
        appPassword: "p",
        connectedAt: 0,
      },
      companyName: "Ridgeline Solar",
    });

    expect(planTopicResearchQueries).not.toHaveBeenCalled();
    expect(postOpenRouterAppChat).not.toHaveBeenCalled();
    expect(result.llmAudit.platforms[0]?.status).toBe("error");
    expect(result.llmAudit.platforms[0]?.error).toBe(TOPIC_RESEARCH_FANOUT_CITY_REQUIRED);
  });
});

