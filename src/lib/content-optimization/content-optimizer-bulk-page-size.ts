/** Content Optimizer bulk runs paginate when URL count exceeds this (UI + processing). */
export const CONTENT_OPTIMIZER_BULK_PAGE_SIZE = 100;

/** Overview WordPress upload: one bulk-update HTTP call for the whole eligible set. */
export const OVERVIEW_WP_UPLOAD_CHUNK_SIZE = 500;

/** Client chunk size for Overview WP upload (one chunk = one bulk-update-overview-seo HTTP call). */
export function overviewWpUploadChunkSize(eligibleCount: number): number {
  if (eligibleCount <= 0) return 1;
  return Math.min(eligibleCount, OVERVIEW_WP_UPLOAD_CHUNK_SIZE);
}

export type ContentOptimizerBulkPageRange = {
  start: number;
  end: number;
  page: number;
  pageCount: number;
};

export function contentOptimizerBulkUsesPagination(urlCount: number): boolean {
  return urlCount > CONTENT_OPTIMIZER_BULK_PAGE_SIZE;
}

export function contentOptimizerBulkPageCount(urlCount: number): number {
  if (urlCount <= 0) return 0;
  return Math.ceil(urlCount / CONTENT_OPTIMIZER_BULK_PAGE_SIZE);
}

/** Zero-based page index for a global row index. */
export function contentOptimizerBulkPageForIndex(
  globalIndex: number,
  pageSize: number = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): number {
  if (globalIndex < 0) return 0;
  return Math.floor(globalIndex / pageSize);
}

/** Inclusive page ranges for bulk processing (always at least one page when urlCount > 0). */
export function contentOptimizerBulkPageRanges(
  urlCount: number,
  pageSize: number = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): ContentOptimizerBulkPageRange[] {
  if (urlCount <= 0) return [];
  const pageCount = Math.max(1, Math.ceil(urlCount / pageSize));
  const ranges: ContentOptimizerBulkPageRange[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, urlCount);
    ranges.push({ start, end, page: page + 1, pageCount });
  }
  return ranges;
}
