import { describe, expect, it, vi } from "vitest";
import { seedBulkUrlKeywordsFromCaches } from "../bulk-optimization-seed-keywords";

describe("seedBulkUrlKeywordsFromCaches", () => {
  it("uses ACF keyword_focus only", () => {
    const setBulkOptimizationState = vi.fn((fn) =>
      fn({
        "site-batch": { urlKeywords: {} },
      }),
    );

    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, {
      keyword_focus: "Blind Upkeep Service Brooklands Winnipeg MB",
    });

    seedBulkUrlKeywordsFromCaches({
      urls: ["https://example.com/a/"],
      batchKey: "site-batch",
      prefetchedPostFieldsCache,
      setBulkOptimizationState,
    });

    const updated = setBulkOptimizationState.mock.calls[0][0]({
      "site-batch": { urlKeywords: {} },
    });
    expect(updated["site-batch"].urlKeywords["https://example.com/a/"]).toBe(
      "Blind Upkeep Service Brooklands Winnipeg MB",
    );
  });

  it("skips URLs with no ACF keyword_focus", () => {
    const setBulkOptimizationState = vi.fn((fn) =>
      fn({
        "site-batch": { urlKeywords: { "https://example.com/a/": "old" } },
      }),
    );

    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, { keyword_focus: "house painter amisk" });

    seedBulkUrlKeywordsFromCaches({
      urls: ["https://example.com/a/", "https://example.com/b/"],
      batchKey: "site-batch",
      prefetchedPostFieldsCache,
      setBulkOptimizationState,
    });

    const updated = setBulkOptimizationState.mock.calls[0][0]({
      "site-batch": { urlKeywords: {} },
    });
    expect(updated["site-batch"].urlKeywords["https://example.com/a/"]).toBe("house painter amisk");
    expect(updated["site-batch"].urlKeywords["https://example.com/b/"]).toBeUndefined();
  });
});
