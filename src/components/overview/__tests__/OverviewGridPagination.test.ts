import { describe, expect, it } from "vitest";
import {
  overviewGridCountLabelMinCh,
  overviewGridPageSlice,
} from "@/components/overview/overview-grid-pagination-helpers";
import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimization/content-optimizer-bulk-page-size";

describe("overviewGridCountLabelMinCh", () => {
  it("reserves width for longest end/total pair", () => {
    expect(overviewGridCountLabelMinCh(41)).toBe(5);
    expect(overviewGridCountLabelMinCh(112)).toBe(7);
    expect(overviewGridCountLabelMinCh(0)).toBe(3);
  });
});

describe("overviewGridPageSlice", () => {
  it("returns all rows when count is at most page size", () => {
    const rows = Array.from({ length: 100 }, (_, i) => i);
    expect(overviewGridPageSlice(rows, 0)).toEqual(rows);
  });

  it("returns 100 rows per page when count exceeds page size", () => {
    const rows = Array.from({ length: 250 }, (_, i) => i);
    expect(overviewGridPageSlice(rows, 0)).toHaveLength(CONTENT_OPTIMIZER_BULK_PAGE_SIZE);
    expect(overviewGridPageSlice(rows, 0)[0]).toBe(0);
    expect(overviewGridPageSlice(rows, 1)[0]).toBe(100);
    expect(overviewGridPageSlice(rows, 2)).toHaveLength(50);
  });
});
