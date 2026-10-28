import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { RESEARCH_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-research-harness-sections";

const rowPath = join(dirname(fileURLToPath(import.meta.url)), "../overview-research-row.ts");

const mockFetchOptionalDataForSeoSerp = vi.fn();
const mockFetchLlmAuditOpenRouter = vi.fn();
const mockResolveSerpDumpJsonForBrief = vi.fn();

vi.mock("@/lib/llm-audit/fetch-seo-content-brief-wave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm-audit/fetch-seo-content-brief-wave")>();
  return {
    ...actual,
    fetchOptionalDataForSeoSerp: (...args: unknown[]) => mockFetchOptionalDataForSeoSerp(...args),
    resolveSerpDumpJsonForBrief: (...args: unknown[]) => mockResolveSerpDumpJsonForBrief(...args),
  };
});

vi.mock("@/lib/llm-audit/llm-audit-openrouter", () => ({
  fetchLlmAuditOpenRouterWithQfo: (...args: unknown[]) => mockFetchLlmAuditOpenRouter(...args),
}));

function makeRow(): OverviewRow {
  return {
    url: "https://example.com/solar-installer",
    title: "Solar Installer",
    metaDescription: "",
    aiTitle: "",
    aiMeta: "",
    status: "research-faq",
    focusKeyword: "solar installer",
  };
}

describe("runOverviewResearchForRow sequential harness", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetchOptionalDataForSeoSerp.mockReset();
    mockFetchLlmAuditOpenRouter.mockReset();
    mockResolveSerpDumpJsonForBrief.mockReset();
  });

  it("runs all 7 harness steps and returns brief when DataForSEO SERP fails", async () => {
    mockFetchOptionalDataForSeoSerp.mockResolvedValue({
      storedFile: null,
      serpMcpJson: null,
      serpError: "DFS unavailable",
    });
    mockFetchLlmAuditOpenRouter.mockResolvedValue({
      llmAudit: {
        siteUrl: "https://example.com/solar-installer",
        location: "United States",
        focusKeyword: "solar installer",
        platforms: [
          {
            platform: "chat_gpt",
            label: "Seed: solar installer",
            model_name: "openai/gpt-4o-mini",
            status: "ok",
            responseText: "Solar installer research summary.",
          },
        ],
      },
      queryFanout: {
        queries: ["solar installer grants United States"],
        namedPrograms: [],
        chatGptByQuery: [{ query: "solar installer grants United States", responseText: "Grant info." }],
      },
    });
    mockResolveSerpDumpJsonForBrief.mockResolvedValue({
      serpDumpJson: { tasks: [] },
      loadSummary: "No DataForSEO SERP dump; OpenRouter LLM audit used for SERP research",
    });

    const harness: BulkHarnessSectionPayload[] = [];
    const artifacts: Array<{ name: string; content: string }> = [];

    const { runOverviewResearchForRow } = await import("@/lib/overview/overview-research-row");
    const result = await runOverviewResearchForRow({
      row: makeRow(),
      rowIndex: 3,
      site: undefined,
      gscQuickWinsFile: null,
      serpDumpUrl: (f) => `https://api.test/serp/${f}`,
      skipGsc: true,
      silent: true,
      onHarnessSection: (payload) => harness.push(payload),
      onResearchArtifact: (file) => artifacts.push({ name: file.name, content: file.content }),
    });

    expect(result.patch?.seoResearch).toContain('"focusKeyword": "solar installer"');
    expect(mockFetchLlmAuditOpenRouter).toHaveBeenCalled();
    expect(harness.filter((h) => h.phase === "done").length).toBe(7);
    expect(harness.some((h) => h.title === "LLM audit" && h.phase === "done")).toBe(true);
    expect(harness.some((h) => h.title === "Brief merge" && h.phase === "done")).toBe(true);
    expect(artifacts.some((f) => f.name.includes("llm-audit"))).toBe(true);
    expect(artifacts.some((f) => f.name.startsWith("serp-research-brief-"))).toBe(true);
  });

  it("still completes all 7 steps when OpenRouter LLM audit times out", async () => {
    mockFetchOptionalDataForSeoSerp.mockResolvedValue({
      storedFile: "serp-dump.json",
      serpMcpJson: { tasks: [{ result: [] }] },
      serpError: null,
    });
    mockFetchLlmAuditOpenRouter.mockResolvedValue({
      llmAudit: {
        siteUrl: "https://example.com/solar-installer",
        location: "United States",
        focusKeyword: "solar installer",
        platforms: [
          {
            platform: "chat_gpt",
            label: "OpenRouter web audit",
            model_name: "openai/gpt-4o-mini",
            status: "error",
            error: "The operation was aborted due to timeout",
          },
        ],
      },
    });
    mockResolveSerpDumpJsonForBrief.mockResolvedValue({
      serpDumpJson: { tasks: [] },
      loadSummary: "SERP dump loaded: serp-dump.json",
    });

    const harness: BulkHarnessSectionPayload[] = [];
    const { runOverviewResearchForRow } = await import("@/lib/overview/overview-research-row");
    const result = await runOverviewResearchForRow({
      row: makeRow(),
      rowIndex: 3,
      site: undefined,
      gscQuickWinsFile: null,
      serpDumpUrl: (f) => `https://api.test/serp/${f}`,
      skipGsc: true,
      silent: true,
      onHarnessSection: (payload) => harness.push(payload),
    });

    expect(result.patch?.seoResearch).toContain('"focusKeyword": "solar installer"');
    expect(mockFetchLlmAuditOpenRouter).toHaveBeenCalledTimes(1);
    expect(harness.filter((h) => h.phase === "done").length).toBe(7);
  });
});

describe("overview research row source contract", () => {
  it("uses sequential steps without parallel SERP wave in the row runner", () => {
    const src = readFileSync(rowPath, "utf8");
    expect(src).toContain("fetchOptionalDataForSeoSerp");
    expect(src).toContain("runOpenRouterLlmAuditStep");
    expect(src).not.toContain("runSerpAndLlmAuditParallel");
    expect(src).not.toContain("Promise.all");
    expect(RESEARCH_HARNESS_SECTION_TITLES).toHaveLength(7);
  });
});
