import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import { OVERVIEW_AISEO_ROW_CONCURRENCY_MAX } from "@/lib/overview/overview-ai-copy-concurrency";
import { runOverviewAiTitleHarnessBatch } from "@/lib/overview/overview-ai-title-harness-run";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { TitleHarnessSetters } from "@/lib/overview/overview-ai-title-harness-mutations";

vi.mock("@/lib/overview/overview-aiseo-source-html", () => ({
  resolveAiseoHarnessSourceHtml: vi.fn(async () => ({
    html: "<p>Body</p>",
    cachedHtml: "<p>Body</p>",
  })),
}));

vi.mock("@/lib/overview/overview-aiseo-after-upload", () => ({
  uploadAiseoRowAfterWrite: vi.fn(),
}));

const site = {
  id: "wp-1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
} as WordPressSite;

function makeHarnessSetters(): TitleHarnessSetters {
  const bulkState: Record<string, BulkOptimizationState> = {
    "wp-1-batch": {
      urls: [],
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "AI titles",
      runKind: "aiTitle",
      urlGeneratedFiles: {},
    },
  };
  return {
    siteId: "wp-1",
    batchKey: "wp-1-batch",
    setBulkOptimizationState: (updater) => {
      Object.assign(bulkState, typeof updater === "function" ? updater(bulkState) : updater);
    },
    setOptimizationProgress: vi.fn(),
  };
}

describe("runOverviewAiTitleHarnessBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes multiple rows concurrently up to the row limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const optimizeTitle = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return "Optimized Title Example";
    });

    const rows = Array.from({ length: 8 }, (_, index) =>
      createEmptyOverviewRow(`https://example.com/post-${index}/`),
    );
    const catalog = rows.map((row, index) => ({
      index,
      url: row.url!,
      title: `Title ${index}`,
      focusKeyword: `kw-${index}`,
    }));

    const stats = await runOverviewAiTitleHarnessBatch({
      site,
      sitemapSource: "posts",
      rowsRef: { current: rows },
      catalog,
      deps: {
        optimizeTitle,
        resolveSentimentSource: vi.fn(async () => undefined),
      },
      harnessSetters: makeHarnessSetters(),
      getInventoryMatchForUrl: () => undefined,
      updateRow: vi.fn(),
    });

    expect(optimizeTitle).toHaveBeenCalledTimes(8);
    expect(stats.ok).toBe(8);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(OVERVIEW_AISEO_ROW_CONCURRENCY_MAX);
  });
});
