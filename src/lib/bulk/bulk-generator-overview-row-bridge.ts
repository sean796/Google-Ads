import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
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
import { formatDirectImportHtml, rowHasDirectImportSource } from "@/lib/bulk/blog-import-direct";
import {
  buildBulkGeneratorPathPreviewContext,
  buildBulkGeneratorStudioList,
  bulkGeneratorRowPathPreview,
  normalizeBulkGeneratorSiteBaseUrl,
  pickLatestRowContentHtml,
  resolveBulkGeneratorStudioRowPhase,
  type BulkGeneratorStudioVariant,
} from "@/lib/bulk/bulk-generator-studio-rows";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewSitemapSourceToUploadConfig } from "@/lib/bulk/bulk-sitemap-mode";

/** Canonical studio URL follows dock sitemap path preview (Posts / Pages / SAP), not raw CSV destination_url. */
export function bulkGeneratorRowUrl(_row: CSVRow, fullUrlPreview: string, pathLabel: string): string {
  const preview = fullUrlPreview.trim();
  if (preview.startsWith("http")) return preview;
  if (preview) return preview;
  return pathLabel || "/blog/";
}

function formatLiveHarnessPreviewPlaceholders(html: string): string {
  return html
    .replace(
      /\[\[EXTERNAL:(https?:\/\/[^|\]]+)\|([^\]]+)\]\]/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>',
    )
    .replace(/\[\[SCROLL:(#[^|\]]+)\|([^\]]+)\]\]/gi, '<a href="$1">$2</a>')
    .replace(/\[\[LINK:[^|\]]+\|([^\]]+)\]\]/gi, "$1");
}

export function bulkHarnessSectionsToBodyHtml(sections: BulkHarnessSectionUi[]): string {
  const pieces = sections
    .filter((s) => s.status === "done" && s.markdown?.trim())
    .sort((a, b) => a.sectionIndex - b.sectionIndex)
    .map((s) => s.markdown!.trim());
  if (pieces.length === 0) return "";
  const stitched = formatLiveHarnessPreviewPlaceholders(stitchHarnessSections(pieces));
  if (isGeneratedContentHtml(stitched) || contentAlreadyHasBlockHtml(stitched)) {
    return stitched;
  }
  return markdownToHtml(stitched);
}

export function bulkGeneratorMarkdownBodyHtml(
  files: BulkGeneratedFile[] | undefined,
  _harnessSections: BulkHarnessSectionUi[],
): string {
  return pickLatestRowContentHtml(files);
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
  sitemapSource?: OverviewSitemapSource;
  site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
  sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
  preserveByUrl?: Map<string, Pick<OverviewRow, "postContent" | "postContentOptimized">>;
  preserveByRowIndex?: Map<number, Pick<OverviewRow, "postContent" | "postContentOptimized">>;
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
    sitemapSource: input.sitemapSource,
    site: input.site,
    sapInventoryRows: input.sapInventoryRows,
  });

  return listItems.map((item) => {
    const harness = input.harnessByRow.get(item.rowIndex) ?? [];
    const isRowCurrentlyRunning = input.isProcessing && item.rowIndex === input.currentRow;
    let bodyHtml = isRowCurrentlyRunning
      ? ""
      : bulkGeneratorMarkdownBodyHtml(input.filesByRow.get(item.rowIndex), harness);
    const urlKey = normalizePageUrlKey(
      bulkGeneratorRowUrl(item.row, item.fullUrlPreview, item.pathLabel),
    );
    const preserved =
      input.preserveByUrl?.get(urlKey) ?? input.preserveByRowIndex?.get(item.rowIndex);
    const skipPreserve = isRowCurrentlyRunning || item.rowIndex === input.streamingRowIndex;
    if (!skipPreserve && preserved?.postContent?.trim()) {
      const preservedHtml = preserved.postContentOptimized?.trim() || preserved.postContent;
      if (!isGeneratedContentHtml(bodyHtml) && isGeneratedContentHtml(preservedHtml)) {
        bodyHtml = preservedHtml;
      } else if (!bodyHtml.trim()) {
        bodyHtml = preservedHtml;
      }
    }
    if (!bodyHtml.trim() && rowHasDirectImportSource(item.row)) {
      try {
        bodyHtml = formatDirectImportHtml(item.row);
      } catch {
        /* ignore empty import body */
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

/** Rewrite CSV destination_url + sitemap_type to match left-dock Posts / Pages / SAP. */
export function bulkCsvRowPatchForSitemapSource(
  row: CSVRow,
  siteBaseUrl: string | null,
  sitemapSource: OverviewSitemapSource,
  options?: {
    site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
    sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
  },
): Partial<CSVRow> {
  const upload = overviewSitemapSourceToUploadConfig(sitemapSource);
  const base = normalizeBulkGeneratorSiteBaseUrl(siteBaseUrl);
  const pathCtx = buildBulkGeneratorPathPreviewContext({
    sitemapSource,
    site: options?.site,
    sapInventoryRows: options?.sapInventoryRows,
  });
  const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview(row, base, pathCtx);
  return {
    destination_url: bulkGeneratorRowUrl(row, fullUrlPreview, pathLabel),
    sitemap_type: upload.sitemapType === "entity" ? "entity" : "post",
  };
}

export function rowIndexForOverviewUrl(rows: OverviewRow[], url: string): number {
  const key = normalizePageUrlKey(url);
  return rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
}

function bulkWordpressProofSubtype(sitemapSource?: OverviewSitemapSource): string {
  if (sitemapSource === "pages") return "page";
  if (sitemapSource === "posts") return "post";
  return "entity";
}

/** Post ID from bulk run `wordpress.json` proof (same row as CSV studio list index). */
export function overviewBindingFromBulkWordpressProofFiles(
  files: BulkGeneratedFile[] | undefined,
  sitemapSource?: OverviewSitemapSource,
): OverviewBinding | undefined {
  const wpFile = files?.find((f) => f.fileName === "wordpress.json" && f.status === "completed");
  if (!wpFile?.content?.trim()) return undefined;
  try {
    const doc = JSON.parse(wpFile.content) as {
      success?: boolean;
      skipped?: boolean;
      postId?: number;
      pageUrl?: string;
    };
    if (doc.skipped || doc.success === false) return undefined;
    const postId = doc.postId;
    if (typeof postId !== "number" || !Number.isFinite(postId) || postId <= 0) return undefined;
    return { postId, subtype: bulkWordpressProofSubtype(sitemapSource) };
  } catch {
    return undefined;
  }
}

/** URL-keyed bindings for Push when overview inventory was never loaded (bulk CSV studio). */
export function bulkGeneratorPushBindingsFromFiles(input: {
  displayRows: CSVRow[];
  filesByRow: Map<number, BulkGeneratedFile[]>;
  siteBaseUrl: string | null;
  sitemapSource?: OverviewSitemapSource;
  site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
  sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
}): Record<string, OverviewBinding> {
  const siteBase = normalizeBulkGeneratorSiteBaseUrl(input.siteBaseUrl);
  const pathCtx = buildBulkGeneratorPathPreviewContext({
    sitemapSource: input.sitemapSource,
    site: input.site,
    sapInventoryRows: input.sapInventoryRows,
  });
  const out: Record<string, OverviewBinding> = {};
  for (const [rowIndex, files] of input.filesByRow) {
    const binding = overviewBindingFromBulkWordpressProofFiles(files, input.sitemapSource);
    if (!binding) continue;
    const row = input.displayRows[rowIndex];
    if (!row) continue;
    const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview(row, siteBase, pathCtx);
    const studioUrl = bulkGeneratorRowUrl(row, fullUrlPreview, pathLabel);
    const studioKey = normalizePageUrlKey(studioUrl);
    if (studioKey) out[studioKey] = binding;
    const wpFile = files.find((f) => f.fileName === "wordpress.json" && f.status === "completed");
    if (wpFile?.content?.trim()) {
      try {
        const doc = JSON.parse(wpFile.content) as { pageUrl?: string };
        const pageKey = doc.pageUrl?.trim() ? normalizePageUrlKey(doc.pageUrl) : "";
        if (pageKey) out[pageKey] = binding;
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

export function overviewUrlForDisplayIndex(
  input: {
    variant: BulkGeneratorStudioVariant;
    displayRows: CSVRow[];
    numberOfBlogs: number;
    hasGeneratedChecklist: boolean;
    siteBaseUrl: string | null;
    sitemapSource?: OverviewSitemapSource;
    site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
    sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
  },
  displayIndex: number,
): string | null {
  const siteBase = normalizeBulkGeneratorSiteBaseUrl(input.siteBaseUrl);
  const pathCtx = buildBulkGeneratorPathPreviewContext({
    sitemapSource: input.sitemapSource,
    site: input.site,
    sapInventoryRows: input.sapInventoryRows,
  });
  const row = input.displayRows[displayIndex];
  if (!row) {
    const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview({} as CSVRow, siteBase, pathCtx);
    return bulkGeneratorRowUrl({} as CSVRow, fullUrlPreview, pathLabel);
  }
  const { pathLabel, fullUrlPreview } = bulkGeneratorRowPathPreview(row, siteBase, pathCtx);
  return bulkGeneratorRowUrl(row, fullUrlPreview, pathLabel);
}
