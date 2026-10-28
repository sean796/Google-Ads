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
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import type { PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { BulkGscKeywordsHostedLink } from "@/lib/bulk/bulk-gsc-keywords-hosted-link";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  buildContentOptimizerBulkGeneratorDetailsProps,
  buildContentOptimizerBulkMicroSnapshot,
  contentOptimizerHeaderProgressFromRun,
  contentOptimizerLiveStatus,
  generatedFilesForUrl,
  isContentOptimizerBulkRun,
  mergeContentOptimizeHarnessSections,
  type ContentOptimizerBulkGeneratorBindingsInput,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import {
  filterAiseoRowDisplayFiles,
  generatedFileName,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  resolveContentOptimizePipelineTitlesForRow,
  resolveContentOptimizePipelineTitlesFromHarness,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { resolveContentPrepBatchSectionTitles } from "@/lib/overview/overview-content-prep-harness-sections";
import { RESEARCH_HARNESS_PIPELINE_TITLES } from "@/lib/overview/overview-research-harness-sections";
import { isResearchBatchState, overviewBatchIsResearchContext } from "@/lib/overview/overview-bulk-pipeline-titles";
import { HEADERS_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-headers-harness-sections";
import { OVERVIEW_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-overview-harness-sections";
import { IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import { WP_UPLOAD_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-wp-upload-harness-sections";
import { buildOverviewWpUploadBatchDetailsProps } from "@/lib/overview/overview-wp-upload-batch-details";
import { linksHarnessSectionTitle } from "@/lib/overview/overview-blog-links-harness-sections";
import type { BlogLinksCatalogRow } from "@/lib/overview/overview-blog-links-catalog";
import { overviewBulkRowEntries } from "@/lib/overview/overview-bulk-row-scope";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { OptimizationFileManager as OptimizationFileManagerClass } from "@/lib/optimization-file-manager";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimizer/content-optimizer-bulk-page-size";

export {
  buildContentOptimizerBulkGeneratorDetailsProps,
  buildContentOptimizerBulkMicroSnapshot,
  contentOptimizerHeaderProgressFromRun,
  contentOptimizerLiveStatus,
  isContentOptimizerBulkRun,
  mergeContentOptimizeHarnessSections,
  type ContentOptimizerBulkGeneratorBindingsInput,
};

export type OverviewBulkDetailsBindingsInput = ContentOptimizerBulkGeneratorBindingsInput & {
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  siteKwHostedLink?: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading?: boolean;
  sitemapSource?: OverviewSitemapSource;
  bulkActionProgress?: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>;
  bulkScopeUrlKeys?: Set<string>;
};

export function isOverviewBulkDetailsRun(
  batchState: BulkOptimizationState | null | undefined,
): boolean {
  return Boolean(batchState?.urls?.length);
}

const LINKS_PIPELINE_TITLES = [
  linksHarnessSectionTitle({} as BlogLinksCatalogRow, 0),
  linksHarnessSectionTitle({} as BlogLinksCatalogRow, 1),
] as const;

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
): BulkHarnessSectionUi["status"] {
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
    ]);
  });
  return map;
}

function resolveMicroCurrentRow(harnessByRow: Map<number, BulkHarnessSectionUi[]>): number {
  for (const [index, sections] of harnessByRow) {
    if (sections.some((section) => section.status === "generating")) return index;
  }
  return -1;
}

export function resolveOverviewBulkPipelineTitles(
  runKind: BulkOptimizationState["runKind"] | undefined,
  bulkState?: BulkOptimizationState,
  overviewRows?: import("@/components/overview/overview-meta-row-types").OverviewRow[],
): readonly string[] | undefined {
  if (
    runKind === "research" ||
    isResearchBatchState(bulkState ?? (runKind ? { runKind } : null)) ||
    overviewBatchIsResearchContext(bulkState, overviewRows)
  ) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }
  if (
    bulkState?.currentStepProgress?.harnessPlannedSectionCount === RESEARCH_HARNESS_PIPELINE_TITLES.length &&
    (runKind === "research" ||
      bulkState.currentStep?.includes("Research") ||
      bulkState.currentStepProgress?.message?.includes("Research"))
  ) {
    return [...RESEARCH_HARNESS_PIPELINE_TITLES];
  }

  if (bulkState && isContentOptimizerBulkRun(bulkState)) {
    const currentUrl = bulkState.currentUrl?.trim();
    const rowHarness =
      (currentUrl ? bulkState.urlHarnessSections?.[currentUrl] : undefined) ??
      Object.values(bulkState.urlHarnessSections ?? {})[0];
    const rowFiles = currentUrl
      ? generatedFilesForUrl(bulkState.urlGeneratedFiles, currentUrl)
      : undefined;
    const articleTitle =
      sanitizeHarnessArticleTitle(
        overviewRows?.find((row) => row.url?.trim() === currentUrl)?.title?.trim() ?? "",
        { pageUrl: currentUrl, keyword: bulkState.urlKeywords?.[currentUrl ?? ""] },
      );
    const mergedHarness = mergeContentOptimizeHarnessSections(
      rowHarness as BulkHarnessSectionUi[],
      rowFiles,
      articleTitle,
      currentUrl,
      bulkState.urlKeywords?.[currentUrl ?? ""],
      currentUrl && typeof bulkState.urlEntities?.[currentUrl] === "string"
        ? bulkState.urlEntities[currentUrl]
        : undefined,
    );
    return [...resolveContentOptimizePipelineTitlesForRow(mergedHarness, rowFiles)];
  }

  switch (runKind) {
    case undefined:
    case "content":
    case "extraText":
      return [...CONTENT_OPTIMIZE_PIPELINE_TITLES];
    case "research":
      return [...RESEARCH_HARNESS_PIPELINE_TITLES];
    case "aiHeaders":
      return [...HEADERS_HARNESS_SECTION_TITLES];
    case "aiLinks":
      return [...LINKS_PIPELINE_TITLES];
    case "aiTitle":
    case "aiMeta":
    case "aiUrl":
    case "contentKw":
    case "entityKw":
      return undefined;
    case "aiAnswer":
      return ["Answer"];
    case "aiOverview":
      return [...OVERVIEW_HARNESS_SECTION_TITLES];
    case "aiScenario":
      return ["Scenario"];
    case "aiInContentImage":
      return [...IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES];
    case "aiFeaturedImage":
      return [...FEATURED_IMAGE_PIPELINE_TITLES];
    case "wpUpload":
      return [...WP_UPLOAD_HARNESS_SECTION_TITLES];
    case "contentCleanup":
      return ["Clean Up"];
    case "aiWikipediaLink":
      return ["Wikipedia link"];
    case "aiAllMeta":
    case "aiFaq":
      return undefined;
    default:
      if (bulkState?.batchPrepHarnessSections?.length) {
        return resolveContentPrepBatchSectionTitles(
          bulkState.runKind === "content" && Boolean(bulkState.urlEntities),
        );
      }
      return undefined;
  }
}

function activeMicroActionKey(
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

function overviewRowToCsvRowFromOverview(
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
  input: Pick<
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

function attachInventoryProps(
  props: BulkGeneratorDetailsPanelProps,
  input: Pick<
    OverviewBulkDetailsBindingsInput,
    "sitemapInventoryLinks" | "siteKwHostedLink" | "sitemapInventoryLoading" | "sitemapSource"
  >,
  pipelineSectionTitles?: readonly string[],
): BulkGeneratorDetailsPanelProps {
  return {
    ...props,
    sitemapInventoryLinks: input.sitemapInventoryLinks,
    siteKwHostedLink: input.siteKwHostedLink ?? null,
    sitemapInventoryLoading: input.sitemapInventoryLoading ?? false,
    pipelineSectionTitles: pipelineSectionTitles ? [...pipelineSectionTitles] : props.pipelineSectionTitles,
    entitySapRowDisplay: input.sitemapSource === "sap",
  };
}

export function buildOverviewWarmInventoryDetailsProps(
  input: Pick<
    OverviewBulkDetailsBindingsInput,
    | "sitemapInventoryLinks"
    | "siteKwHostedLink"
    | "sitemapInventoryLoading"
    | "sitemapSource"
    | "overviewRows"
    | "gridPageIndex"
  >,
): BulkGeneratorDetailsPanelProps {
  const allRows = input.overviewRows;
  const paginate = input.gridPageIndex != null && contentOptimizerBulkUsesPagination(allRows.length);
  const pageStart = paginate ? Math.max(0, input.gridPageIndex ?? 0) * CONTENT_OPTIMIZER_BULK_PAGE_SIZE : 0;
  const pageRows = paginate
    ? allRows.slice(pageStart, pageStart + CONTENT_OPTIMIZER_BULK_PAGE_SIZE)
    : allRows;
  const displayRows = pageRows.map((row) => overviewRowToCsvRowFromOverview(row));
  return {
    variant: "csv",
    workspaceBusy: Boolean(input.sitemapInventoryLoading),
    headerProgress: null,
    isProcessing: false,
    status: "",
    harnessSections: [],
    harnessByRow: new Map(),
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: null,
    currentRow: -1,
    totalRows: allRows.length,
    displayRows,
    detailsPageStart: pageStart,
    postDestination: "wordpress",
    wpConfig: null,
    sitemapInventoryLinks: input.sitemapInventoryLinks,
    siteKwHostedLink: input.siteKwHostedLink ?? null,
    sitemapInventoryLoading: input.sitemapInventoryLoading ?? false,
    entitySapRowDisplay: input.sitemapSource === "sap",
    filesByRow: new Map(),
  };
}

export function buildOverviewBulkGeneratorDetailsProps(
  input: OverviewBulkDetailsBindingsInput,
  workspaceBusy: boolean,
): BulkGeneratorDetailsPanelProps | null {
  if (input.bulkState?.runKind === "wpUpload") {
    return attachInventoryProps(
      buildOverviewWpUploadBatchDetailsProps(input, workspaceBusy),
      input,
    );
  }

  if (input.bulkState?.runKind === "aiFeaturedImage") {
    const slice = input.bulkActionProgress?.aiFeaturedImage ?? {
      total: input.bulkState.urls.length,
      completed: input.bulkState.urls.length,
      statusMessage: META_BULK_MICRO_LABELS.aiFeaturedImage,
    };
    return buildOverviewMicroActionDetailsProps(input, "aiFeaturedImage", slice);
  }

  const researchSlice = input.bulkActionProgress?.research;
  const researchProgressActive = Boolean(
    researchSlice && researchSlice.total > 0 && researchSlice.completed < researchSlice.total,
  );
  const researchBatchActive =
    overviewBatchIsResearchContext(input.bulkState, input.overviewRows) ||
    researchProgressActive;
  const microKey = activeMicroActionKey(input.bulkActionProgress);
  const bodyFileSlotBatch =
    isOverviewBulkDetailsRun(input.bulkState) &&
    isAiseoFileSlotRunKind(input.bulkState.runKind);
  const optimizeAllUsesBlogPipeline =
    microKey === "optimizeAll" && isOverviewBulkDetailsRun(input.bulkState);
  if (
    !researchBatchActive &&
    !bodyFileSlotBatch &&
    !optimizeAllUsesBlogPipeline &&
    microKey &&
    input.bulkActionProgress?.[microKey]
  ) {
    return buildOverviewMicroActionDetailsProps(input, microKey, input.bulkActionProgress[microKey]!);
  }

  if (!isOverviewBulkDetailsRun(input.bulkState)) {
    return null;
  }

  const base = buildContentOptimizerBulkGeneratorDetailsProps(input, workspaceBusy);
  const pipelineSectionTitles = resolveOverviewBulkPipelineTitles(
    base.runKind ?? input.bulkState.runKind,
    input.bulkState,
    input.overviewRows,
  );
  return attachInventoryProps(base, input, pipelineSectionTitles);
}

export function buildOverviewBulkMicroSnapshot(
  input: OverviewBulkDetailsBindingsInput,
): MetaBulkMicroSnapshot | null {
  if (!isOverviewBulkDetailsRun(input.bulkState)) {
    return null;
  }
  return buildContentOptimizerBulkMicroSnapshot(input);
}

export function overviewBulkDetailsCanOpenFromWarm(
  _sitemapInventoryLinks: PromptBulkSitemapInventoryLink[],
  _gscHostedLink: BulkGscKeywordsHostedLink | null,
  _sitemapInventoryLoading: boolean,
): boolean {
  return true;
}

export function overviewRowByUrlMap(rows: OverviewRow[]): Map<string, OverviewRow> {
  const map = new Map<string, OverviewRow>();
  for (const row of rows) {
    const key = normalizePageUrlKey(row.url);
    if (key) map.set(key, row);
  }
  return map;
}

export type MultiSiteBulkDetailsInput = {
  siteId: string;
  batchKey: string;
  bulkState: BulkOptimizationState;
  batchProgress?: OptimizationProgressState;
  siteProgress?: OptimizationProgressState;
  overviewRows: OverviewRow[];
  isOptimizingContent: Record<string, boolean>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  siteName?: string;
  sitemapInventoryLinks?: PromptBulkSitemapInventoryLink[];
  siteKwHostedLink?: BulkGscKeywordsHostedLink | null;
  sitemapInventoryLoading?: boolean;
};

export function buildMultiSiteBulkGeneratorDetailsProps(
  input: MultiSiteBulkDetailsInput,
  workspaceBusy: boolean,
): BulkGeneratorDetailsPanelProps | null {
  if (!isOverviewBulkDetailsRun(input.bulkState)) return null;
  const base = buildContentOptimizerBulkGeneratorDetailsProps(input, workspaceBusy);
  const pipelineSectionTitles = resolveOverviewBulkPipelineTitles(
    base.runKind ?? input.bulkState.runKind,
    input.bulkState,
    input.overviewRows,
  );
  return attachInventoryProps(
    base,
    {
      sitemapInventoryLinks: input.sitemapInventoryLinks,
      siteKwHostedLink: input.siteKwHostedLink,
      sitemapInventoryLoading: input.sitemapInventoryLoading,
      sitemapSource: undefined,
    },
    pipelineSectionTitles,
  );
}
