import { describe, expect, it, vi, beforeEach } from "vitest";
import { createBulkSerpWarmupController } from "../bulk-optimization-serp-warmup";
import type { BulkOptimizationState } from "../use-optimization-state";

const emptyBatch = (): BulkOptimizationState => ({
  urls: [],
  currentIndex: 0,
  urlStatuses: {},
  currentStep: "",
});
import { hasSubstantiveSeoResearch } from "../bulk-optimization-missing-seo-research";

const fetchBrief = vi.fn();

vi.mock("../bulk-optimization-missing-seo-research", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bulk-optimization-missing-seo-research")>();
  return {
    ...actual,
    fetchDataForSeoSerpBriefJson: (...args: unknown[]) => fetchBrief(...args),
  };
});

describe("createBulkSerpWarmupController", () => {
  beforeEach(() => {
    fetchBrief.mockReset();
    fetchBrief.mockResolvedValue('{"version":1,"focusKeyword":"kw b"}');
  });

  it("fills missing seo_research via DataForSEO when keyword exists", async () => {
    const urls = ["https://example.com/a/", "https://example.com/b/", "https://example.com/c/"];
    const acf = new Map<number, Record<string, unknown>>([
      [0, { keyword_focus: "kw a", seo_research: '{"brief":true}' }],
      [1, { keyword_focus: "kw b" }],
      [2, { keyword_focus: "kw c", seo_research: '{"brief":true}' }],
    ]);
    const pending = new Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>();
    const skipUrlSet = new Set<string>();
    let batchState: BulkOptimizationState = emptyBatch();

    const controller = createBulkSerpWarmupController({
      urls,
      batchKey: "site-batch",
      skipUrlSet,
      muteToasts: true,
      prefetchedPostFieldsCache: acf,
      prefetchedPendingCache: pending,
      setBulkOptimizationState: (action) => {
        if (typeof action === "function") {
          batchState = action({ "site-batch": batchState })["site-batch"]!;
        }
      },
    });

    controller.seedReadyFromAcf();
    expect(controller.isIndexReady(0)).toBe(true);
    expect(controller.isIndexReady(1)).toBe(false);
    expect(controller.isIndexReady(2)).toBe(true);

    const ready1 = await controller.ensureReady(1);
    expect(ready1).toBe(true);
    expect(fetchBrief).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "kw b", pageUrl: "https://example.com/b/" }),
    );
    expect(hasSubstantiveSeoResearch(acf.get(1))).toBe(true);
  });

  it("throws when keyword_focus is missing (no AI backfill)", async () => {
    const urls = ["https://example.com/service-area/hunter-douglas-blinds-edmonton/"];
    const acf = new Map<number, Record<string, unknown>>([[0, {}]]);
    const pending = new Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>([
      [
        0,
        {
          pending: {
            site: { id: "site-1" },
            existingTitle: "Hunter Douglas Blinds Edmonton",
            acfFields: {},
          },
          primaryKeyword: "",
        },
      ],
    ]);
    const skipUrlSet = new Set<string>();

    const controller = createBulkSerpWarmupController({
      urls,
      batchKey: "site-batch",
      skipUrlSet,
      muteToasts: true,
      prefetchedPostFieldsCache: acf,
      prefetchedPendingCache: pending,
      setBulkOptimizationState: (action) => {
        if (typeof action === "function") action({ "site-batch": emptyBatch() });
      },
    });

    await expect(controller.ensureReady(0)).rejects.toThrow(/keyword_focus is required/i);
    expect(fetchBrief).not.toHaveBeenCalled();
  });

  it("propagates SERP brief fetch failures", async () => {
    fetchBrief.mockRejectedValue(new Error("DataForSEO unavailable"));

    const urls = ["https://example.com/missing-brief/"];
    const acf = new Map<number, Record<string, unknown>>([[0, { keyword_focus: "kw" }]]);
    const pending = new Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>();
    const skipUrlSet = new Set<string>();

    const controller = createBulkSerpWarmupController({
      urls,
      batchKey: "site-batch",
      skipUrlSet,
      muteToasts: true,
      prefetchedPostFieldsCache: acf,
      prefetchedPendingCache: pending,
      setBulkOptimizationState: (action) => {
        if (typeof action === "function") action({ "site-batch": emptyBatch() });
      },
    });

    await expect(controller.ensureReady(0)).rejects.toThrow("DataForSEO unavailable");
    expect(hasSubstantiveSeoResearch(acf.get(0))).toBe(false);
  });

  it("skips DataForSEO when cache already has seo_research", async () => {
    const urls = ["https://example.com/already-researched/"];
    const acf = new Map<number, Record<string, unknown>>([
      [0, { keyword_focus: "kw", seo_research: '{"primary_keyword":"kw"}' }],
    ]);
    const pending = new Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>();
    const skipUrlSet = new Set<string>();

    const controller = createBulkSerpWarmupController({
      urls,
      batchKey: "site-batch",
      skipUrlSet,
      muteToasts: true,
      prefetchedPostFieldsCache: acf,
      prefetchedPendingCache: pending,
      setBulkOptimizationState: (action) => {
        if (typeof action === "function") action({ "site-batch": emptyBatch() });
      },
    });

    controller.seedReadyFromAcf();
    const ok = await controller.ensureReady(0);
    expect(ok).toBe(true);
    expect(fetchBrief).not.toHaveBeenCalled();
  });
});
