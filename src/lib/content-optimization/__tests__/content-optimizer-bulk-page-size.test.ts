import { describe, expect, it } from "vitest";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageCount,
  contentOptimizerBulkPageForIndex,
  contentOptimizerBulkPageRanges,
  contentOptimizerBulkUsesPagination,
  overviewWpUploadChunkSize,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";

describe("contentOptimizerBulkPageRanges", () => {
  it("returns one page when count is at most page size", () => {
    expect(contentOptimizerBulkPageRanges(100)).toEqual([
      { start: 0, end: 100, page: 1, pageCount: 1 },
    ]);
    expect(contentOptimizerBulkUsesPagination(100)).toBe(false);
  });

  it("splits into 100-sized pages when count exceeds page size", () => {
    expect(contentOptimizerBulkPageCount(601)).toBe(7);
    const ranges = contentOptimizerBulkPageRanges(601);
    expect(ranges).toHaveLength(7);
    expect(ranges[0]).toEqual({ start: 0, end: 100, page: 1, pageCount: 7 });
    expect(ranges[6]).toEqual({ start: 600, end: 601, page: 7, pageCount: 7 });
    expect(contentOptimizerBulkUsesPagination(601)).toBe(true);
  });

  it("maps global index to page", () => {
    expect(contentOptimizerBulkPageForIndex(0)).toBe(0);
    expect(contentOptimizerBulkPageForIndex(99)).toBe(0);
    expect(contentOptimizerBulkPageForIndex(100)).toBe(1);
    expect(CONTENT_OPTIMIZER_BULK_PAGE_SIZE).toBe(100);
  });
});

describe("overviewWpUploadChunkSize", () => {
  it("uses one bulk HTTP call for typical overview uploads", () => {
    expect(overviewWpUploadChunkSize(74)).toBe(74);
    expect(overviewWpUploadChunkSize(126)).toBe(126);
    expect(overviewWpUploadChunkSize(199)).toBe(199);
    expect(overviewWpUploadChunkSize(500)).toBe(500);
    expect(overviewWpUploadChunkSize(501)).toBe(500);
  });
});
