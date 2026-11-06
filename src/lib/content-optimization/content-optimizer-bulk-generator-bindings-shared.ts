import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { isResearchBatchState } from "@/lib/overview/overview-bulk-pipeline-titles";

export type ContentOptimizerBulkGeneratorBindingsInput = {
  siteId: string;
  batchKey: string;
  bulkState: BulkOptimizationState;
  batchProgress?: OptimizationProgressState;
  siteProgress?: OptimizationProgressState;
  overviewRows: OverviewRow[];
  isOptimizingContent: Record<string, boolean>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  siteName?: string;
  /** Live grid page (0-based). Idle/complete details follow this page, not a stale batch page. */
  gridPageIndex?: number;
};


export function isContentOptimizerBulkRun(
  batchState: BulkOptimizationState | null | undefined,
): boolean {
  if (!batchState?.urls?.length) return false;
  const kind = batchState.runKind;
  return !kind || kind === "content";
}

export function overviewRowByUrl(rows: OverviewRow[]): Map<string, OverviewRow> {
  const map = new Map<string, OverviewRow>();
  for (const row of rows) {
    const key = normalizePageUrlKey(row.url);
    if (key) map.set(key, row);
  }
  return map;
}

export function overviewRowToCsvRow(
  row: OverviewRow | undefined,
  url: string,
  bulkState: BulkOptimizationState,
): CSVRow {
  const keyword =
    row?.focusKeyword?.trim() ||
    bulkState.urlKeywords?.[url]?.trim() ||
    "";
  const entity =
    bulkState.urlEntities?.[url] && bulkState.urlEntities[url] !== "N/A"
      ? String(bulkState.urlEntities[url])
      : undefined;
  return {
    keyword,
    title: row?.title?.trim() || row?.aiTitle?.trim() || url,
    meta_description: row?.metaDescription?.trim() || undefined,
    publish_date_gmt: row?.dateModifier?.trim() || row?.wpDateGmt?.trim() || undefined,
    destination_url: url,
    seo_research: row?.seoResearch?.trim() || undefined,
    entity,
    origin: entity,
  };
}

export function harnessSectionsForUrl(
  byUrl: BulkOptimizationState["urlHarnessSections"] | undefined,
  url: string,
): BulkHarnessSectionUi[] | undefined {
  const direct = byUrl?.[url] as BulkHarnessSectionUi[] | undefined;
  if (direct?.length) return direct;
  const key = normalizePageUrlKey(url);
  if (!key || !byUrl) return undefined;
  for (const [candidateUrl, sections] of Object.entries(byUrl)) {
    if (normalizePageUrlKey(candidateUrl) === key && (sections as BulkHarnessSectionUi[])?.length) {
      return sections as BulkHarnessSectionUi[];
    }
  }
  return undefined;
}

/** Read urlGeneratedFiles with normalized URL fallback (batch url vs row url slash drift). */
export function generatedFilesForUrl<T extends { name?: string; fileName?: string }>(
  byUrl: Record<string, T[]> | undefined,
  url: string,
): T[] {
  const trimmed = url.trim();
  const direct = byUrl?.[trimmed];
  if (direct?.length) return direct;
  const key = normalizePageUrlKey(trimmed);
  if (!key || !byUrl) return [];
  for (const [candidateUrl, files] of Object.entries(byUrl)) {
    if (files?.length && normalizePageUrlKey(candidateUrl) === key) return files;
  }
  return [];
}

/** Pick the storage key for urlGeneratedFiles (prefer batch urls entry). */
export function storageKeyForUrlGeneratedFiles(
  byUrl: Record<string, unknown[]> | undefined,
  url: string,
  batchUrls?: string[],
): string {
  const trimmed = url.trim();
  if (byUrl?.[trimmed]) return trimmed;
  const key = normalizePageUrlKey(trimmed);
  if (batchUrls?.length && key) {
    for (const batchUrl of batchUrls) {
      if (normalizePageUrlKey(batchUrl) === key) return batchUrl.trim();
    }
  }
  if (byUrl && key) {
    for (const candidateUrl of Object.keys(byUrl)) {
      if (normalizePageUrlKey(candidateUrl) === key) return candidateUrl;
    }
  }
  return trimmed;
}

export function resolveCurrentRow(bulkState: BulkOptimizationState): number {
  const urls = bulkState.urls ?? [];
  if (urls.length === 0) return 0;

  if (isResearchBatchState(bulkState)) {
    const currentIndex = bulkState.currentIndex ?? 0;
    if (currentIndex >= 0 && currentIndex < urls.length) return currentIndex;
  }

  for (let i = 0; i < urls.length; i += 1) {
    if (bulkState.urlStatuses?.[urls[i]!] === "optimizing") return i;
  }

  const currentIndex = bulkState.currentIndex ?? 0;
  if (currentIndex >= 0 && currentIndex < urls.length) return currentIndex;

  const currentUrl = bulkState.currentUrl?.trim();
  if (currentUrl) {
    const idx = urls.findIndex((u) => normalizePageUrlKey(u) === normalizePageUrlKey(currentUrl));
    if (idx >= 0) return idx;
  }

  return 0;
}
