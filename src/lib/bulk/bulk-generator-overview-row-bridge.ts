import type { OverviewRow, RowStatus } from "@/components/overview/overview-meta-row-types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import {
  contentAlreadyHasBlockHtml,
  isGeneratedContentHtml,
} from "@/lib/content-generation/content-format";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { markdownToHtml } from "@/lib/markdown-to-html";
import {
  buildBulkGeneratorStudioList,
  bulkGeneratorRowPathPreview,
  normalizeBulkGeneratorSiteBaseUrl,
  pickLatestRowContentHtml,
  resolveBulkGeneratorStudioRowPhase,
  type BulkGeneratorStudioVariant,
} from "@/lib/bulk/bulk-generator-studio-rows";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export function bulkGeneratorRowUrl(row: CSVRow, fullUrlPreview: string, pathLabel: string): string {
  const dest = row.destination_url?.trim();
  if (dest) return dest.startsWith("http") ? dest : fullUrlPreview;
  if (fullUrlPreview.startsWith("http")) return fullUrlPreview;
  return pathLabel || "/blog/";
}

export function bulkHarnessSectionsToBodyHtml(sections: BulkHarnessSectionUi[]): string {
  const pieces = sections
    .filter((s) => s.status === "done" && s.markdown?.trim())
    .sort((a, b) => a.sectionIndex - b.sectionIndex)
    .map((s) => s.markdown!.trim());
  if (pieces.length === 0) return "";
  const stitched = stitchHarnessSections(pieces);
  if (isGeneratedContentHtml(stitched) || contentAlreadyHasBlockHtml(stitched)) {
    return stitched;
  }
  return markdownToHtml(stitched);
}

export function bulkGeneratorMarkdownBodyHtml(
  files: BulkGeneratedFile[] | undefined,
  harnessSections: BulkHarnessSectionUi[],
): string {
  const fromFile = pickLatestRowContentHtml(files);
  if (fromFile) return fromFile;
  return bulkHarnessSectionsToBodyHtml(harnessSections);
}

export function bulkCsvRowToOverviewRow(input: {
  row: CSVRow;
  fullUrlPreview: string;
  pathLabel: string;
  bodyHtml: string;
  status?: RowStatus;
}): OverviewRow {
  const title = input.row.title?.trim() || "";
  const meta = input.row.meta_description?.trim() || "";
  return {
    url: bulkGeneratorRowUrl(input.row, input.fullUrlPreview, input.pathLabel),
    title,
    metaDescription: meta,
    aiTitle: title,
    aiMeta: meta,
    focusKeyword: input.row.keyword?.trim() || "",
    aiSuggestedPath: input.pathLabel,
    postContent: input.bodyHtml,
    postContentOptimized: input.bodyHtml,
    status: input.status ?? "idle",
    wpDateGmt: input.row.publish_date_gmt,
    seoResearch: input.row.seo_research,
  };
}

function rowStatusFromGeneratorPhase(phase: ReturnType<typeof resolveBulkGeneratorStudioRowPhase>): RowStatus {
  if (phase === "error") return "error";
  if (phase === "writing") return "ai-headers";
  return "idle";
}

export function overviewRowPatchToCsvPatch(patch: Partial<OverviewRow>): Partial<CSVRow> {
  const out: Partial<CSVRow> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.aiTitle !== undefined) out.title = patch.aiTitle;
  if (patch.metaDescription !== undefined) out.meta_description = patch.metaDescription;
  if (patch.aiMeta !== undefined) out.meta_description = patch.aiMeta;
  if (patch.focusKeyword !== undefined) out.keyword = patch.focusKeyword;
  if (patch.wpDateGmt !== undefined) out.publish_date_gmt = patch.wpDateGmt;
  if (patch.seoResearch !== undefined) out.seo_research = patch.seoResearch;
  return out;
}

export function buildBulkGeneratorOverviewRows(input: {
  variant: BulkGeneratorStudioVariant;
  displayRows: CSVRow[];
  numberOfBlogs: number;
  hasGeneratedChecklist: boolean;
  filesByRow: Map<number, BulkGeneratedFile[]>;
  harnessByRow: Map<number, BulkHarnessSectionUi[]>;
  currentRow: number;
  isProcessing: boolean;
  failedRowIndices: ReadonlySet<number>;
  siteBaseUrl: string | null;
  preserveByUrl?: Map<string, Pick<OverviewRow, "postContent" | "postContentOptimized">>;
  /** Row index receiving live generation; do not preserve stale body on this row. */
  streamingRowIndex?: number;
}): OverviewRow[] {
  const siteBase = normalizeBulkGeneratorSiteBaseUrl(input.siteBaseUrl);
  const listItems = buildBulkGeneratorStudioList({
    variant: input.variant,
    sourceRows: input.displayRows,
    numberOfBlogs: input.numberOfBlogs,
    minEmptySlotCount: BULK_GENERATOR_EMPTY_ROW_COUNT,
    hasGeneratedChecklist: input.hasGeneratedChecklist,
    filesByRow: input.filesByRow,
    currentRow: input.currentRow,
    isProcessing: input.isProcessing,
    failedRowIndices: input.failedRowIndices,
    siteBaseUrl: siteBase,
  });

  return listItems.map((item) => {
    const harness = input.harnessByRow.get(item.rowIndex) ?? [];
    let bodyHtml = bulkGeneratorMarkdownBodyHtml(input.filesByRow.get(item.rowIndex), harness);
    const urlKey = normalizePageUrlKey(
      bulkGeneratorRowUrl(item.row, item.fullUrlPreview, item.pathLabel),
    );
    const preserved = input.preserveByUrl?.get(urlKey);
    const skipPreserve = item.rowIndex === input.streamingRowIndex;
    if (!skipPreserve && preserved?.postContent?.trim()) {
      const preservedHtml = preserved.postContentOptimized?.trim() || preserved.postContent;
      if (!isGeneratedContentHtml(bodyHtml) && isGeneratedContentHtml(preservedHtml)) {
        bodyHtml = preservedHtml;
      } else if (!bodyHtml.trim()) {
        bodyHtml = preservedHtml;
      }
    }
    const phase = resolveBulkGeneratorStudioRowPhase({
      placeholder: item.placeholder,
      hasGeneratedChecklist: input.hasGeneratedChecklist,
      variant: input.variant,
      rowIndex: item.rowIndex,
      currentRow: input.currentRow,
      isProcessing: input.isProcessing,
      failed: input.failedRowIndices.has(item.rowIndex),
      hasContentArtifact: Boolean(bodyHtml.trim()),
    });
    const overview = bulkCsvRowToOverviewRow({
      row: item.row,
      fullUrlPreview: item.fullUrlPreview,
      pathLabel: item.pathLabel,
      bodyHtml,
      status: rowStatusFromGeneratorPhase(phase),
    });
    if (item.placeholder) {
      overview.title = item.title;
      overview.aiTitle = item.title;
    }
    return overview;
  });
}

export function bulkGeneratedFilesToOptimizationArtifacts(
  files: BulkGeneratedFile[] | undefined,
): Array<{ name: string; content: string; mimeType: string }> {
  if (!files?.length) return [];
  return files
    .filter((f) => f.status === "completed" && f.content?.trim())
    .map((f) => ({
      name: f.fileName,
      content: f.content,
      mimeType: f.mimeType || "text/plain;charset=utf-8",
    }));
}

export function rowIndexForOverviewUrl(rows: OverviewRow[], url: string): number {
  const key = normalizePageUrlKey(url);
  return rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
}

export function overviewUrlForDisplayIndex(
  input: {
    variant: BulkGeneratorStudioVariant;
    displayRows: CSVRow[];
    numberOfBlogs: number;
    hasGeneratedChecklist: boolean;
    siteBaseUrl: string | null;
  },
  displayIndex: number,
): string | null {
  const siteBase = normalizeBulkGeneratorSiteBaseUrl(input.siteBaseUrl);
  const row = input.displayRows[displayIndex];
  if (!row) {
    const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview({} as CSVRow, siteBase);
    return bulkGeneratorRowUrl({} as CSVRow, fullUrlPreview, pathLabel);
  }
  const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview(row, siteBase);
  return bulkGeneratorRowUrl(row, fullUrlPreview, pathLabel);
}
