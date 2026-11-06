import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { OverviewRow, RowStatus } from "@/components/overview/overview-meta-row-types";
import type {
  BulkProgressSlice,
  MetaBulkActionKey,
} from "@/components/overview/overview-tab-constants";
import {
  FEATURED_IMAGE_PIPELINE_TITLES,
  META_BULK_MICRO_LABELS,
  META_BULK_MICRO_ORDER,
} from "@/components/overview/overview-tab-constants";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import {
  filterAiseoRowDisplayFiles,
  generatedFileName,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { CONTENT_OPTIMIZE_PIPELINE_TITLES } from "@/lib/overview/overview-content-optimize-pipeline";
import { overviewBulkRowEntries } from "@/lib/overview/overview-bulk-row-scope";
import { OptimizationFileManager as OptimizationFileManagerClass } from "@/lib/optimization-file-manager";
import type { OverviewBulkDetailsBindingsInput } from "@/lib/overview/overview-bulk-details-bindings-types";

const MICRO_ACTION_SINGLE_STEP: Partial<Record<MetaBulkActionKey, readonly string[]>> = {
  scrape: ["Scraping live titles & meta"],
  dates: ["Updating dates"],
  entityKw: ["Entity keywords"],
  contentKw: ["AI keywords (content)"],
  aiTitle: ["AI titles"],
  aiMeta: ["AI meta"],
  aiUrl: ["AI URL paths"],
  optimizeAll: CONTENT_OPTIMIZE_PIPELINE_TITLES,
  loadSitemap: ["Loading sitemap"],
  inventoryHydrate: ["Applying WordPress inventory"],
};

const MICRO_KEY_ACTIVE_ROW_STATUS: Partial<Record<MetaBulkActionKey, RowStatus>> = {
  scrape: "scraping",
  entityKw: "ai-focus-kw",
  contentKw: "ai-focus-kw",
  aiTitle: "ai-title",
  aiMeta: "ai-meta",
  aiUrl: "ai-url",
};

function resolveMicroRowPipelineTitles(key: MetaBulkActionKey): readonly string[] {
  if (key === "aiFeaturedImage") return FEATURED_IMAGE_PIPELINE_TITLES;
  const single = MICRO_ACTION_SINGLE_STEP[key];
  if (single?.length) return single;
  return [META_BULK_MICRO_LABELS[key] ?? "Processing"];
}

function resolveMicroRowPipelineTitle(key: MetaBulkActionKey): string {
  return resolveMicroRowPipelineTitles(key)[0] ?? "Processing";
}

function microRowHarnessStatus(
  row: OverviewRow,
  microKey: MetaBulkActionKey,
  isProcessing: boolean,
  displayIndex: number,
  slice: BulkProgressSlice,
): BulkHarnessSectionUi["status"] | "error" {
  if (row.status === "error") return "error";
  const activeStatus = MICRO_KEY_ACTIVE_ROW_STATUS[microKey];
  if (activeStatus) {
    if (row.status === activeStatus) return "generating";
    if (!isProcessing) return "done";
    return "waiting";
  }
  if (!isProcessing) return "done";
  const completed = Math.min(slice.completed, slice.total);
  if (displayIndex < completed) return "done";
  if (displayIndex === completed && completed < slice.total) return "generating";
  return "waiting";
}

function microActionFilesByRow(
  scopedEntries: Array<{ row: OverviewRow; index: number }>,
  bulkState: BulkOptimizationState | undefined,
): Map<number, BulkGeneratedFile[]> {
  const map = new Map<number, BulkGeneratedFile[]>();
  if (!bulkState?.urlGeneratedFiles) return map;
  const runKind = bulkState.runKind;
  scopedEntries.forEach(({ row }, displayIndex) => {
    const url = row.url?.trim();
    if (!url) return;
    const persisted = generatedFilesForUrl(bulkState.urlGeneratedFiles, url);
    if (!persisted.length) return;
    const rowFiles = isAiseoFileSlotRunKind(runKind)
      ? filterAiseoRowDisplayFiles(runKind, persisted)
      : persisted;
    if (!rowFiles.length) return;
    const csvRow = overviewRowToCsvRowFromOverview(row, bulkState);
    map.set(
      displayIndex,
      rowFiles.map((file, fileIndex) => {
        const fileName = generatedFileName(file);
        return {
        id: `micro-${displayIndex}-${fileIndex}-${fileName}`,
        rowIndex: displayIndex,
        fileName,
        content: file.content,
        mimeType: file.mimeType,
        status: "completed" as const,
        timestamp: Date.now() + fileIndex,
        rowData: {
          keyword: csvRow.keyword,
          entity: csvRow.entity,
          title: csvRow.title,
          meta_description: csvRow.meta_description,
        },
      };
      }),
    );
  });
  return map;
}

function resolveMicroActionRunKind(
  bulkState: BulkOptimizationState | undefined,
  filesByRow: Map<number, BulkGeneratedFile[]>,
): BulkOptimizationState["runKind"] | undefined {
  if (bulkState?.runKind === "aiFeaturedImage") return "aiFeaturedImage";
  if (isAiseoFileSlotRunKind(bulkState?.runKind)) return bulkState.runKind;
  for (const files of filesByRow.values()) {
    if (files.some((file) => file.fileName === "wordpress.json")) return "wpUpload";
  }
  return undefined;
}

function featuredImageSectionStatus(
  files: BulkGeneratedFile[] | undefined,
  displayIndex: number,
  isProcessing: boolean,
  slice: BulkProgressSlice,
  sectionIndex: number,
): BulkHarnessSectionUi["status"] {
  const names = (files ?? []).map((file) => file.fileName);
  const hasRequirements = names.includes("image-requirements.json");
  const hasGoogle = names.includes("google-image.png");
  const hasOpenRouter = names.some((name) => name.startsWith("openrouter-image."));
  const hasWp = names.includes("wordpress.json");
  if (sectionIndex === 0 && hasRequirements) return "done";
  if (sectionIndex === 1 && hasGoogle) return "done";
  if (sectionIndex === 2 && hasOpenRouter) return "done";
  if (sectionIndex === 3 && hasWp) return "done";
  const completed = Math.min(slice.completed, slice.total);
  if (!isProcessing) return hasWp ? "done" : "waiting";
  if (displayIndex < completed) return "done";
  if (displayIndex === completed) {
    if (sectionIndex === 0 && !hasRequirements) return "generating";
    if (sectionIndex === 1 && hasRequirements && !hasGoogle) return "generating";
    if (sectionIndex === 2 && hasGoogle && !hasOpenRouter) return "generating";
    if (sectionIndex === 3 && hasOpenRouter && !hasWp) return "generating";
  }
  return "waiting";
}

function buildMicroHarnessByRow(
  scopedEntries: Array<{ row: OverviewRow; index: number }>,
  microKey: MetaBulkActionKey,
  isProcessing: boolean,
  slice: BulkProgressSlice,
  filesByRow?: Map<number, BulkGeneratedFile[]>,
): Map<number, BulkHarnessSectionUi[]> {
  const titles = resolveMicroRowPipelineTitles(microKey);
  const map = new Map<number, BulkHarnessSectionUi[]>();
  scopedEntries.forEach(({ row }, displayIndex) => {
    if (microKey === "aiFeaturedImage") {
      map.set(
        displayIndex,
        titles.map((title, sectionIndex) => ({
          sectionIndex,
          title,
          status: featuredImageSectionStatus(
            filesByRow?.get(displayIndex),
            displayIndex,
            isProcessing,
            slice,
            sectionIndex,
          ),
        })),
      );
      return;
    }
    map.set(displayIndex, [
      {
        sectionIndex: 0,
        title: titles[0] ?? "Processing",
        status: microRowHarnessStatus(row, microKey, isProcessing, displayIndex, slice),
      },
    ] as BulkHarnessSectionUi[]);
  });
  return map;
}

function resolveMicroCurrentRow(harnessByRow: Map<number, BulkHarnessSectionUi[]>): number {
  for (const [index, sections] of harnessByRow) {
    if (sections.some((section) => section.status === "generating")) return index;
  }
  return -1;
}

export function activeMicroActionKey(
  bulkActionProgress: Partial<Record<MetaBulkActionKey, BulkProgressSlice>> | undefined,
): MetaBulkActionKey | null {
  if (!bulkActionProgress) return null;
  for (const key of META_BULK_MICRO_ORDER) {
    const slice = bulkActionProgress[key];
    if (!slice || slice.total <= 0) continue;
    if (slice.completed < slice.total) return key;
  }
  return null;
}

function isActiveMicroSlice(slice: BulkProgressSlice | undefined): boolean {
  if (!slice || slice.total <= 0) return false;
  return slice.completed < slice.total;
}

export function overviewRowToCsvRowFromOverview(
  row: OverviewRow,
  bulkState?: BulkOptimizationState,
): CSVRow {
  const url = row.url?.trim() ?? "";
  const keyword = row.focusKeyword?.trim() || bulkState?.urlKeywords?.[url]?.trim() || "";
  return {
    keyword,
    title: row.title?.trim() || row.aiTitle?.trim() || url,
    meta_description: row.metaDescription?.trim() || undefined,
    publish_date_gmt: row.dateModifier?.trim() || row.wpDateGmt?.trim() || undefined,
    destination_url: url,
    seo_research: row.seoResearch?.trim() || undefined,
    entity:
      bulkState?.urlEntities?.[url] && bulkState.urlEntities[url] !== "N/A"
        ? String(bulkState.urlEntities[url])
        : undefined,
  };
}

export function buildOverviewMicroActionDetailsProps(
  input: Omit<
    Pick<
      OverviewBulkDetailsBindingsInput,
      | "siteId"
      | "batchKey"
      | "bulkState"
      | "overviewRows"
      | "isOptimizingContent"
      | "optimizationFileManagers"
      | "siteName"
      | "bulkActionProgress"
      | "sitemapInventoryLinks"
      | "siteKwHostedLink"
      | "sitemapInventoryLoading"
      | "sitemapSource"
      | "bulkScopeUrlKeys"
    >,
    "bulkState"
  > & { bulkState?: BulkOptimizationState },
  microKey: MetaBulkActionKey,
  slice: BulkProgressSlice,
): BulkGeneratorDetailsPanelProps {
  const scopeKeys = input.bulkScopeUrlKeys ?? new Set<string>();
  const scopedEntries = overviewBulkRowEntries(input.overviewRows, scopeKeys);
  const displayRows = scopedEntries.map(({ row }) => overviewRowToCsvRowFromOverview(row, input.bulkState));
  const pipelineSectionTitles = [...resolveMicroRowPipelineTitles(microKey)];
  const isProcessing = isActiveMicroSlice(slice);
  const filesByRow = microActionFilesByRow(scopedEntries, input.bulkState);
  const runKind = resolveMicroActionRunKind(input.bulkState, filesByRow);
  const harnessByRow = buildMicroHarnessByRow(
    scopedEntries,
    microKey,
    isProcessing,
    slice,
    filesByRow,
  );
  const currentRow =
    typeof slice.currentRow === "number" && slice.currentRow >= 0
      ? slice.currentRow
      : resolveMicroCurrentRow(harnessByRow);
  const status = slice.statusMessage?.trim() || META_BULK_MICRO_LABELS[microKey];
  const downloadManager = new OptimizationFileManagerClass();

  return {
    variant: "csv",
    workspaceBusy: isProcessing,
    headerProgress: null,
    isProcessing,
    status,
    runKind,
    harnessSections: [],
    harnessByRow,
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: pipelineSectionTitles.length,
    currentRow,
    totalRows: slice.total ?? displayRows.length,
    displayRows,
    postDestination: "wordpress",
    wpConfig: null,
    sitemapInventoryLinks: input.sitemapInventoryLinks,
    siteKwHostedLink: input.siteKwHostedLink ?? null,
    sitemapInventoryLoading: input.sitemapInventoryLoading ?? false,
    pipelineSectionTitles: isAiseoFileSlotRunKind(runKind) ? [] : [...pipelineSectionTitles],
    entitySapRowDisplay: input.sitemapSource === "sap",
    filesByRow,
    downloadFile: (file) => {
      downloadManager.downloadFile({
        name: file.fileName,
        content: file.content,
        mimeType: file.mimeType,
      });
    },
  };
}

