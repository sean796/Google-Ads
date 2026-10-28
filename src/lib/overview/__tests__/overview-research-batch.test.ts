import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LLM_AUDIT_QFO_QUERY_CONCURRENCY,
  OVERVIEW_RESEARCH_ROW_CONCURRENCY_MAX,
} from "@/lib/overview/overview-research-batch-constants";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import {
  resolveResearchBatchEligibleRows,
  runOverviewResearchBatch,
} from "@/lib/overview/overview-research-batch";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";

vi.mock("@/lib/overview/overview-research-row", () => ({
  exportOverviewGscForPageUrls: vi.fn().mockResolvedValue(null),
  runOverviewResearchForRow: vi.fn(),
}));

import { runOverviewResearchForRow } from "@/lib/overview/overview-research-row";

function makeRow(url: string, focusKeyword = ""): OverviewRow {
  return {
    url,
    title: url,
    metaDescription: "",
    aiTitle: "",
    aiMeta: "",
    status: "research-faq",
    focusKeyword,
  };
}

describe("resolveResearchBatchEligibleRows", () => {
  it("prefers keywordsByIndex when rowsRef is stale after keyword prep", () => {
    const eligible = [{ index: 2 }, { index: 5 }];
    const rowsByIndex: Record<number, OverviewRow> = {
      2: makeRow("https://example.com/a"),
      5: makeRow("https://example.com/b", "existing kw"),
    };
    const keywordsByIndex = new Map<number, string>([[2, "derived keyword"]]);

    const resolved = resolveResearchBatchEligibleRows(
      eligible,
      (index) => rowsByIndex[index],
      keywordsByIndex,
    );

    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.index).toBe(2);
    expect(resolved[0]?.row.focusKeyword).toBe("derived keyword");
    expect(resolved[1]?.row.focusKeyword).toBe("existing kw");
  });
});

describe("overview research batch limits", () => {
  it("runs up to three research rows in parallel", () => {
    expect(OVERVIEW_RESEARCH_ROW_CONCURRENCY_MAX).toBe(3);
    expect(LLM_AUDIT_QFO_QUERY_CONCURRENCY).toBe(3);
  });

  it("splits 250 eligible rows into three page slices of 100", () => {
    const ranges = overviewBulkPageRanges(250);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toMatchObject({ start: 0, end: 100, page: 1, pageCount: 3 });
    expect(ranges[1]).toMatchObject({ start: 100, end: 200, page: 2, pageCount: 3 });
    expect(ranges[2]).toMatchObject({ start: 200, end: 250, page: 3, pageCount: 3 });
  });
});

describe("runOverviewResearchBatch row pool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("processes multiple rows concurrently up to the row limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(runOverviewResearchForRow).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return {
        patch: { seoResearch: "brief", researchFileName: "brief.json" },
        harnessSummaries: {},
      };
    });

    const eligible = [0, 1, 2, 3, 4].map((index) => ({
      index,
      row: makeRow(`https://example.com/${index}`, `kw-${index}`),
    }));

    const { results, stats } = await runOverviewResearchBatch(
      eligible,
      {
        site: undefined,
        gscQuickWinsFile: null,
        serpDumpUrl: (name) => name,
        skipGsc: true,
        silent: true,
      },
      { batchIndex: 0, batchCount: 1, total: 5, completedOffset: 0 },
    );

    expect(results).toHaveLength(5);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(OVERVIEW_RESEARCH_ROW_CONCURRENCY_MAX);
    expect(stats.briefUpdated).toBe(5);
  });

  it("awaits onPageComplete before resolving the batch", async () => {
    vi.mocked(runOverviewResearchForRow).mockResolvedValue({
      patch: { seoResearch: "brief", researchFileName: "brief.json" },
      harnessSummaries: {},
    });

    let completeFinished = false;
    let batchResolvedBeforeComplete = false;
    const onPageComplete = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      completeFinished = true;
    });

    const batchPromise = runOverviewResearchBatch(
      [{ index: 0, row: makeRow("https://example.com/0", "kw-0") }],
      {
        site: undefined,
        gscQuickWinsFile: null,
        serpDumpUrl: (name) => name,
        skipGsc: true,
        silent: true,
      },
      { batchIndex: 0, batchCount: 1, total: 1, completedOffset: 0 },
      { onPageComplete },
    );
    void batchPromise.then(() => {
      if (!completeFinished) batchResolvedBeforeComplete = true;
    });

    await batchPromise;
    expect(onPageComplete).toHaveBeenCalledOnce();
    expect(completeFinished).toBe(true);
    expect(batchResolvedBeforeComplete).toBe(false);
  });
});
