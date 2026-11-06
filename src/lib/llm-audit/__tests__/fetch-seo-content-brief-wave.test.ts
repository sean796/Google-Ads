import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  extractSerpDumpJsonFromMcpResponse,
  fetchOptionalDataForSeoSerp,
  fetchSeoContentBriefWave,
  resolveSerpLocationName,
  serpDumpFilenameUrl,
  serpMcpJsonHasSerpTasks,
  storedFileFromSerpMcpResponse,
} from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { markDfsPaymentFailed, resetDfsPaymentLatch } from "@/lib/llm-audit/dataforseo-llm-responses-live";
import {
  setPostCreatorWorkerApiBase,
} from "@/lib/wordpress-api/connection";

vi.mock("@/lib/mcp-tools", () => ({
  mcp_DataForSEO_serp_organic_live_advanced: vi.fn(),
}));

vi.mock("@/lib/llm-audit/llm-audit-dataforseo", () => ({
  fetchLlmAuditParallel: vi.fn(),
}));

import { mcp_DataForSEO_serp_organic_live_advanced } from "@/lib/mcp-tools";
import { fetchLlmAuditParallel } from "@/lib/llm-audit/llm-audit-dataforseo";

describe("fetch-seo-content-brief-wave", () => {
  beforeEach(() => {
    resetDfsPaymentLatch();
    vi.resetAllMocks();
    setPostCreatorWorkerApiBase("");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tasks: [{ result: [{ items: [] }] }] }),
      }),
    );
  });

  it("serpDumpFilenameUrl uses worker api base when set", () => {
    setPostCreatorWorkerApiBase("http://localhost:8080");
    const url = serpDumpFilenameUrl("test-serp.json");
    expect(url.startsWith("http://localhost:8080/api/dataforseo/serp-dump/test-serp.json")).toBe(true);
    expect(url.startsWith("/api/")).toBe(false);
    setPostCreatorWorkerApiBase("");
  });

  it("storedFileFromSerpMcpResponse reads stored_file", () => {
    expect(storedFileFromSerpMcpResponse({ stored_file: "serp-abc.json" })).toBe("serp-abc.json");
    expect(storedFileFromSerpMcpResponse({ storedFile: "serp-def.json" })).toBe("serp-def.json");
    expect(storedFileFromSerpMcpResponse(null)).toBeNull();
  });

  it("fetchSeoContentBriefWave merges SERP dump + LLM audit", async () => {
    vi.mocked(mcp_DataForSEO_serp_organic_live_advanced).mockResolvedValue({
      stored_file: "test-serp.json",
    });
    vi.mocked(fetchLlmAuditParallel).mockResolvedValue({
      siteUrl: "https://example.com",
      location: "Plum Coulee, MB",
      platforms: [
        {
          platform: "chat_gpt",
          label: "ChatGPT",
          model_name: "o4-mini",
          status: "ok",
          responseText: "- Local fact one",
        },
      ],
    });

    const { brief, storedFile } = await fetchSeoContentBriefWave({
      keyword: "custom blinds plum coulee",
      pageUrl: "https://example.com/custom-blinds-plum-coulee",
    });

    expect(storedFile).toBe("test-serp.json");
    expect(brief.focusKeyword).toBe("custom blinds plum coulee");
    expect(brief.llmAudit?.platforms).toHaveLength(1);
    expect(brief.llmAudit?.platforms[0]?.status).toBe("ok");
  });

  it("fetchSeoContentBriefWave uses inline SERP JSON when stored file is missing", async () => {
    const inlineSerp = { tasks: [{ result: [{ items: [{ type: "organic", title: "Test" }] }] }] };
    vi.mocked(mcp_DataForSEO_serp_organic_live_advanced).mockResolvedValue(inlineSerp);
    vi.mocked(fetchLlmAuditParallel).mockResolvedValue({
      siteUrl: "https://example.com",
      location: "Sherwood Park, AB",
      platforms: [],
    });

    const { brief, storedFile } = await fetchSeoContentBriefWave({
      keyword: "alberta tax brackets sherwood park",
      pageUrl: "https://example.com/alberta-tax-brackets-sherwood-park",
    });

    expect(storedFile).toBeNull();
    expect(brief.focusKeyword).toBe("alberta tax brackets sherwood park");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetchSeoContentBriefWave merges LLM audit when SERP dump is missing", async () => {
    vi.mocked(mcp_DataForSEO_serp_organic_live_advanced).mockResolvedValue({});
    vi.mocked(fetchLlmAuditParallel).mockResolvedValue({
      siteUrl: "https://example.com",
      location: "Sherwood Park, AB",
      platforms: [
        {
          platform: "chat_gpt",
          label: "ChatGPT",
          model_name: "o4-mini",
          status: "ok",
          responseText: "- Local trust reporting note",
        },
      ],
    });

    const { brief, storedFile } = await fetchSeoContentBriefWave({
      keyword: "bare trust reporting sherwood park",
      pageUrl: "https://example.com/bare-trust-reporting-sherwood-park",
    });

    expect(storedFile).toBeNull();
    expect(brief.focusKeyword).toBe("bare trust reporting sherwood park");
    expect(brief.llmAudit?.platforms).toHaveLength(1);
  });

  it("fetchSeoContentBriefWave continues with LLM audit when SERP dump is empty", async () => {
    vi.mocked(mcp_DataForSEO_serp_organic_live_advanced).mockResolvedValue({});
    vi.mocked(fetchLlmAuditParallel).mockResolvedValue({
      siteUrl: "https://posh-outdoors.com",
      location: "",
      platforms: [
        { platform: "chat_gpt", label: "ChatGPT", model_name: "o4-mini", status: "ok", responseText: "x" },
        { platform: "gemini", label: "Gemini", model_name: "gemini", status: "ok", responseText: "x" },
        { platform: "perplexity", label: "Perplexity", model_name: "sonar", status: "ok", responseText: "x" },
      ],
    });

    const { brief, storedFile } = await fetchSeoContentBriefWave({
      keyword: "luxury camping",
      pageUrl: "https://posh-outdoors.com/blog/luxury-camping/",
      requireSerpDump: true,
    });

    expect(storedFile).toBeNull();
    expect(brief.focusKeyword).toBe("luxury camping");
    expect(brief.llmAudit?.platforms).toHaveLength(3);
  });

  it("resolveSerpLocationName prefers Sherwood Park for Alberta keywords", () => {
    expect(resolveSerpLocationName("", "alberta tax brackets sherwood park")).toBe(
      "Sherwood Park,Alberta,Canada",
    );
    expect(resolveSerpLocationName("", "edmonton accounting firm")).toBe("Edmonton,Alberta,Canada");
  });

  it("does not map the English word on to Ontario", () => {
    expect(resolveSerpLocationName("", "blinds on windows")).toBe("United States");
    expect(resolveSerpLocationName("", "Solar Panel Efficiency: What It Means")).toBe("United States");
    expect(resolveSerpLocationName("", "ontario solar grants")).toBe("Toronto,Ontario,Canada");
  });

  it("resolveSerpLocationName uses Canada when title or query mentions Canada or Canadian", () => {
    expect(
      resolveSerpLocationName(
        "Edmonton, AB",
        "Hunter Douglas shades Canadian winters drafty windows",
      ),
    ).toBe("Canada");
    expect(
      resolveSerpLocationName(
        "",
        "A Complete Buying Guide To Hunter Douglas Top-Down Bottom-Up Shades In Canada 2026",
      ),
    ).toBe("Canada");
  });

  it("extractSerpDumpJsonFromMcpResponse reads nested tasks", () => {
    expect(extractSerpDumpJsonFromMcpResponse({ tasks: [{ result: [] }] })).toEqual({
      tasks: [{ result: [] }],
    });
    expect(
      extractSerpDumpJsonFromMcpResponse({ details: { tasks: [{ result: [] }] } }),
    ).toEqual({ tasks: [{ result: [] }] });
    expect(extractSerpDumpJsonFromMcpResponse({})).toBeNull();
  });

  it("skips SERP MCP when DataForSEO payment is latched", async () => {
    markDfsPaymentFailed();
    const result = await fetchOptionalDataForSeoSerp({ keyword: "window blinds" });
    expect(mcp_DataForSEO_serp_organic_live_advanced).not.toHaveBeenCalled();
    expect(result.serpMcpJson).toBeNull();
    expect(result.serpError).toBeNull();
  });

  it("serpMcpJsonHasSerpTasks detects inline MCP payload", () => {
    expect(serpMcpJsonHasSerpTasks({ tasks: [{ result: [] }] })).toBe(true);
    expect(serpMcpJsonHasSerpTasks({})).toBe(false);
    expect(serpMcpJsonHasSerpTasks(null)).toBe(false);
  });
});
