import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchLlmAuditParallelMock = vi.fn();

vi.mock("@/lib/llm-audit/llm-audit-dataforseo", () => ({
  fetchLlmAuditParallel: (...args: unknown[]) => fetchLlmAuditParallelMock(...args),
}));

vi.mock("@/lib/mcp-tools", () => ({
  mcp_DataForSEO_serp_organic_live_advanced: vi.fn(),
}));

import { runSerpAndLlmAuditParallel } from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { mcp_DataForSEO_serp_organic_live_advanced } from "@/lib/mcp-tools";

describe("runSerpAndLlmAuditParallel prefetched SERP", () => {
  beforeEach(() => {
    fetchLlmAuditParallelMock.mockReset();
    fetchLlmAuditParallelMock.mockResolvedValue({
      platforms: [{ status: "ok", label: "test", liveLinks: [] }],
    });
    vi.mocked(mcp_DataForSEO_serp_organic_live_advanced).mockReset();
  });

  it("skips live SERP when prefetched JSON has tasks", async () => {
    const progress: string[] = [];
    const prefetchedSerpMcpJson = {
      tasks: [{ result: [{ items: [{ type: "organic", title: "Example" }] }] }],
    };

    const result = await runSerpAndLlmAuditParallel({
      keyword: "custom blinds",
      pageUrl: "https://example.com/custom-blinds",
      prefetchedSerpMcpJson,
      callbacks: { onProgress: (m) => progress.push(m) },
    });

    expect(mcp_DataForSEO_serp_organic_live_advanced).not.toHaveBeenCalled();
    expect(fetchLlmAuditParallelMock).toHaveBeenCalledTimes(1);
    expect(progress.some((m) => m.includes("SERP reused"))).toBe(true);
    expect(result.serpMcpJson).toEqual(prefetchedSerpMcpJson);
  });
});
