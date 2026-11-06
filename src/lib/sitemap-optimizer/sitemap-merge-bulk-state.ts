import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { WordPressSite } from "@/components/integrations/types";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageCount,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

export type SitemapMergeSitemapType = "post" | "entity";

export function resolveSitemapMergeSitemapType(
  site: WordPressSite | null | undefined,
  entityPrimary?: boolean,
): SitemapMergeSitemapType {
  if (entityPrimary && site?.entitySitemapUrl?.trim()) {
    return "entity";
  }
  return "post";
}

export function sitemapRowUrlKey(row: CSVRow | undefined, rowIndex: number): string {
  const dest = row?.destination_url?.trim();
  if (dest) return dest;
  const title = row?.title?.trim();
  if (title) return title;
  const kw = row?.keyword?.trim();
  if (kw) return kw;
  return `sitemap-merge-row-${rowIndex}`;
}

export function publishedLinkFromRowFiles(
  files: BulkGeneratedFile[] | undefined,
): string | null {
  if (!files?.length) return null;
  for (const file of files) {
    if (file.status !== "completed") continue;
    if (!file.fileName.startsWith("wordpress-post-")) continue;
    try {
      const parsed = JSON.parse(file.content) as { link?: string };
      const link = parsed.link?.trim();
      if (link) return link;
    } catch {
      /* try next file */
    }
  }
  return null;
}

function generatedFilesForUrl(
  files: BulkGeneratedFile[],
): Array<{ name: string; content: string; mimeType: string }> {
  return files
    .filter((f) => f.status === "completed")
    .map((f) => ({
      name: f.fileName,
      content: f.content,
      mimeType: f.mimeType,
    }));
}

export type BuildSitemapMergeBulkStateArgs = {
  rows: CSVRow[];
  currentRow: number;
  totalRows: number;
  publishing: boolean;
  status: string;
  harnessSections: BulkHarnessSectionUi[];
  harnessPlannedSectionCount: number | null;
  filesByRow: Map<number, BulkGeneratedFile[]>;
  urlHarnessSections: Record<string, BulkHarnessSectionUi[]>;
  publishedLinksByRowIndex: Map<number, string>;
};

export function buildSitemapMergeBulkState(
  args: BuildSitemapMergeBulkStateArgs,
): BulkOptimizationState | null {
  const {
    rows,
    currentRow,
    publishing,
    status,
    harnessSections,
    harnessPlannedSectionCount,
    filesByRow,
    urlHarnessSections,
    publishedLinksByRowIndex,
  } = args;

  if (!rows.length) return null;

  const urls = rows.map((row, index) => sitemapRowUrlKey(row, index));

  const urlStatuses: BulkOptimizationState["urlStatuses"] = {};
  const urlKeywords: Record<string, string> = {};
  const urlEntities: Record<string, string | "N/A"> = {};
  const urlGeneratedFiles: NonNullable<BulkOptimizationState["urlGeneratedFiles"]> = {};
  const harnessByUrl: NonNullable<BulkOptimizationState["urlHarnessSections"]> = {
    ...urlHarnessSections,
  };

  rows.forEach((row, index) => {
    const url = urls[index]!;
    const destKey = sitemapRowUrlKey(row, index);

    if (index < currentRow) {
      urlStatuses[url] = "completed";
    } else if (index === currentRow && publishing) {
      urlStatuses[url] = "optimizing";
    } else {
      urlStatuses[url] = "pending";
    }

    const kw = row.keyword_focus?.trim() || row.keyword?.trim();
    if (kw) urlKeywords[url] = kw;

    const entity = row.entity?.trim();
    if (entity) urlEntities[url] = entity;

    const rowFiles = filesByRow.get(index);
    if (rowFiles?.length) {
      urlGeneratedFiles[url] = generatedFilesForUrl(rowFiles);
    }

    if (index === currentRow && publishing && harnessSections.length > 0) {
      harnessByUrl[destKey] = harnessSections;
    }
  });

  const activeUrl = urls[currentRow];
  const stepProgress = Math.min(
    99,
    harnessPlannedSectionCount && harnessPlannedSectionCount > 0
      ? Math.round(
          (harnessSections.filter((s) => s.status === "done").length /
            harnessPlannedSectionCount) *
            100,
        )
      : publishing
        ? 50
        : 0,
  );

  const urlCount = urls.length;
  const totalBulkPages = contentOptimizerBulkPageCount(urlCount) || 1;

  return {
    urls,
    currentIndex: currentRow,
    urlStatuses,
    currentStep: status,
    currentUrl: activeUrl,
    currentProgress: stepProgress,
    currentStepProgress: {
      stepId: publishing ? "publish" : "write",
      subProgress: stepProgress,
      step: status,
      progress: stepProgress,
      message: status,
      harnessSections,
      harnessPlannedSectionCount,
    },
    urlKeywords,
    urlEntities,
    urlGeneratedFiles,
    urlHarnessSections: harnessByUrl,
    runKind: "wpUpload",
    bulkPageSize: CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
    totalBulkPages,
  };
}

export function publishedLinksByUrlFromRows(
  rows: CSVRow[],
  publishedLinksByRowIndex: Map<number, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  rows.forEach((row, index) => {
    const link = publishedLinksByRowIndex.get(index);
    if (!link) return;
    const destKey = sitemapRowUrlKey(row, index);
    out[destKey] = link;
  });
  return out;
}

export function entityPrimaryFromResult(result: SitemapOptimizerRunResult | null): boolean {
  if (!result) return false;
  if (result.entityPrimary) return true;
  return isEntityCompressionRunResult(result);
}

const EDITORIAL_COLLECTIONS = new Set(["posts", "post", "pages", "page"]);

/** Detect entity/service-area runs saved before entityPrimary was persisted on the result. */
export function isEntityCompressionRunResult(result: SitemapOptimizerRunResult): boolean {
  if (result.entityPrimary) return true;
  if (!result.rows.length) return false;
  const entityRows = result.rows.filter((row) => {
    const collection = row.collection.trim().toLowerCase();
    return collection.length > 0 && !EDITORIAL_COLLECTIONS.has(collection);
  });
  return entityRows.length > 0 && entityRows.length >= result.rows.length * 0.5;
}

/** Entity compression, redirect-map, and grid runs allow 1-URL merge families. */
export function minMembersForMergePublish(result: SitemapOptimizerRunResult): number {
  if (isEntityCompressionRunResult(result)) return 1;
  if (result.runMode === "grid_csv") return 1;
  if (result.redirectMapUpload) return 1;
  if (result.rows.some((row) => Boolean(row.gridRedirectFromUrl?.trim()))) return 1;
  return 2;
}
