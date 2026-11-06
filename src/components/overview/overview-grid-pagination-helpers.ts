import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimization/content-optimizer-bulk-page-size";

/** Min `ch` width for the `end/total` label at a given layout total. */
export function overviewGridCountLabelMinCh(layoutTotal: number): number {
  if (layoutTotal <= 0) return 3;
  return String(layoutTotal).length * 2 + 1;
}

export function overviewGridPageSlice<T>(
  items: T[],
  pageIndex: number,
  pageSize: number = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): T[] {
  if (items.length <= 0) return items;
  const start = pageIndex * pageSize;
  return items.slice(start, start + pageSize);
}
