import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
  type BlogImportHeaderProgress,
} from "@/lib/bulk/blog-import-header-progress";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OptimizationFileManager as OptimizationFileManagerClass } from "@/lib/optimization-file-manager";
import {
  RESEARCH_HARNESS_PIPELINE_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-research-harness-sections";
import {
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  buildResearchRowIndexSet,
  isResearchBatchState,
  resolveSimpleAiseoBatchPipelineTitles,
  type ResearchBatchSignals,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  resolveContentOptimizePipelineTitlesForRow,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import {
  isOverviewBatchAllComplete,
  isOverviewResearchBatchInFlight,
} from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  generatedFilesForUrl,
  harnessSectionsForUrl,
  isContentOptimizerBulkRun,
  overviewRowByUrl,
  overviewRowToCsvRow,
  resolveCurrentRow,
  type ContentOptimizerBulkGeneratorBindingsInput,
} from "./content-optimizer-bulk-generator-bindings-shared";
import {
  buildHarnessByRow,
  harnessPlannedSectionCount,
  liveHarnessSections,
  mergeContentOptimizeHarnessSections,
} from "./content-optimizer-bulk-generator-bindings-harness";
import { buildFilesByRow } from "./content-optimizer-bulk-generator-bindings-files";

export type { ContentOptimizerBulkGeneratorBindingsInput } from "./content-optimizer-bulk-generator-bindings-shared";
export {
  isContentOptimizerBulkRun,
  overviewRowToCsvRow,
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "./content-optimizer-bulk-generator-bindings-shared";
export { mergeContentOptimizeHarnessSections } from "./content-optimizer-bulk-generator-bindings-harness";

const CONTENT_OPTIMIZER_RUN_LABEL = "Content Optimizer";

export function contentOptimizerLiveStatus(
  input: Pick<
    ContentOptimizerBulkGeneratorBindingsInput,
    "bulkState" | "batchProgress" | "siteProgress"
  >,
): string {
  const researchRun =
    !isContentOptimizerBulkRun(input.bulkState) &&
    (isResearchBatchState(input.bulkState) || input.bulkState.runKind === "research");
  if (researchRun) {
    let bulkMsg = input.bulkState.currentStepProgress?.message?.trim();
    if (
      bulkMsg === "Initializing batch…" ||
      bulkMsg === "Initializing batch..." ||
      bulkMsg === "Initializing batch"
    ) {
      bulkMsg =
        input.bulkState.currentStep?.trim() ||
        input.batchProgress?.message?.trim() ||
        "Researching…";
    }
    if (bulkMsg) return bulkMsg;
    const batchMsg = input.batchProgress?.message?.trim();
    if (batchMsg) return batchMsg;
    const siteMsg = input.siteProgress?.message?.trim();
    if (siteMsg) return siteMsg;
    return "";
  }
  const siteMsg = input.siteProgress?.message?.trim();
  if (siteMsg) return siteMsg;
  const siteStep = input.siteProgress?.step?.trim();
  if (siteStep && siteStep !== "Preparing…" && siteStep !== "Preparing...") return siteStep;
  const batchMsg = input.batchProgress?.message?.trim();
  if (batchMsg) return batchMsg;
  const bulkMsg = input.bulkState.currentStepProgress?.message?.trim();
  if (bulkMsg) return bulkMsg;
  return "";
}

function bulkStateUsesResearchPipeline(
  bulkState: BulkOptimizationState,
): boolean {
  if (isContentOptimizerBulkRun(bulkState)) return false;
  return (
    bulkState.runKind === "research" ||
    isResearchBatchState(bulkState) ||
    bulkState.currentStepProgress?.harnessPlannedSectionCount === RESEARCH_HARNESS_TOTAL_SECTIONS
  );
}

export function contentOptimizerHeaderProgressFromRun(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): BlogImportHeaderProgress | null {
  const isProcessing = resolveBulkRunIsProcessing(input);
  const status = contentOptimizerLiveStatus(input);
  if (!isProcessing && !status) return null;

  const urls = input.bulkState.urls ?? [];
  const currentRow = resolveCurrentRow(input.bulkState);
  const completedCount = urls.filter(
    (u) => input.bulkState.urlStatuses?.[u] === "completed",
  ).length;
  const activeUrl = urls[currentRow];
  const activeRowOptimizing =
    Boolean(activeUrl) && input.bulkState.urlStatuses?.[activeUrl!] === "optimizing";

  return blogImportHeaderProgressFromBulk({
    status,
    isProcessing,
    harnessSections: liveHarnessSections(input),
    harnessPlannedSectionCount: harnessPlannedSectionCount(input),
    currentRow,
    batchRowProgress:
      isProcessing && urls.length > 0
        ? {
            current: completedCount,
            total: urls.length,
            activeRowOptimizing,
          }
        : undefined,
  });
}

export function buildContentOptimizerBulkMicroSnapshot(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): MetaBulkMicroSnapshot | null {
  const headerProgress = contentOptimizerHeaderProgressFromRun(input);
  const siteSuffix = input.siteName?.trim() ? ` - ${input.siteName.trim()}` : "";
  return buildBlogImportMicroSnapshot(headerProgress, `${CONTENT_OPTIMIZER_RUN_LABEL}${siteSuffix}`);
}

function isResearchBatchInFlight(bulkState: BulkOptimizationState): boolean {
  return isOverviewResearchBatchInFlight(bulkState);
}

function resolveBulkRunIsProcessing(input: ContentOptimizerBulkGeneratorBindingsInput): boolean {
  if (isOverviewBatchAllComplete(input.bulkState)) return false;
  if (input.isOptimizingContent[input.batchKey] || input.isOptimizingContent[input.siteId]) {
    return true;
  }
  return isResearchBatchInFlight(input.bulkState);
}

function researchBatchSignals(bulkState: BulkOptimizationState): ResearchBatchSignals {
  return {
    runKind: bulkState.runKind,
    currentStep: bulkState.currentStep,
    currentStepProgress: bulkState.currentStepProgress,
    urlHarnessSections: bulkState.urlHarnessSections,
  };
}

type BulkDetailsPageSlice = {
  displayRows: CSVRow[];
  currentRow: number;
  harnessByRow: Map<number, BulkHarnessSectionUi[]>;
  filesByRow: Map<number, BulkGeneratedFile[]>;
  totalRows: number;
  detailsPageStart: number;
};

function attachPageArtifactsByUrl(
  pageUrls: string[],
  batchUrls: string[],
  fullHarness: Map<number, BulkHarnessSectionUi[]>,
  fullFiles: Map<number, BulkGeneratedFile[]>,
): Pick<BulkDetailsPageSlice, "harnessByRow" | "filesByRow"> {
  const harnessByUrl = new Map<string, BulkHarnessSectionUi[]>();
  const filesByUrl = new Map<string, BulkGeneratedFile[]>();
  for (let i = 0; i < batchUrls.length; i += 1) {
    const key = normalizePageUrlKey(batchUrls[i] ?? "");
    if (!key) continue;
    const harness = fullHarness.get(i);
    if (harness?.length) harnessByUrl.set(key, harness);
    const files = fullFiles.get(i);
    if (files?.length) filesByUrl.set(key, files);
  }
  const harnessByRow = new Map<number, BulkHarnessSectionUi[]>();
  const filesByRow = new Map<number, BulkGeneratedFile[]>();
  for (let localIndex = 0; localIndex < pageUrls.length; localIndex += 1) {
    const key = normalizePageUrlKey(pageUrls[localIndex] ?? "");
    if (!key) continue;
    const harness = harnessByUrl.get(key);
    if (harness?.length) harnessByRow.set(localIndex, harness);
    const files = filesByUrl.get(key);
    if (files?.length) filesByRow.set(localIndex, files);
  }
  return { harnessByRow, filesByRow };
}

function sliceBulkDetailsToPage(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): BulkDetailsPageSlice {
  const urls = input.bulkState.urls ?? [];
  const overviewRows = input.overviewRows ?? [];
  const isProcessing = resolveBulkRunIsProcessing(input);
  const useLiveGrid = !isProcessing && overviewRows.length > 0;
  const sourceUrls = useLiveGrid ? overviewRows.map((row) => row.url) : urls;
  const totalRows = sourceUrls.length;
  const rowByUrl = overviewRowByUrl(overviewRows);
  const bulkPageSize = input.bulkState.bulkPageSize ?? CONTENT_OPTIMIZER_BULK_PAGE_SIZE;
  const pageIndex =
    input.gridPageIndex != null
      ? Math.max(0, input.gridPageIndex)
      : Math.max(0, (input.bulkState.currentBulkPage ?? 1) - 1);
  const paginate = contentOptimizerBulkUsesPagination(totalRows);
  const pageStart = paginate ? pageIndex * bulkPageSize : 0;
  const pageEnd = paginate ? Math.min(pageStart + bulkPageSize, totalRows) : totalRows;
  const pageUrls = sourceUrls.slice(pageStart, pageEnd);
  const displayRows = pageUrls.map((url) =>
    overviewRowToCsvRow(rowByUrl.get(normalizePageUrlKey(url)), url, input.bulkState),
  );
  const globalCurrentRow = resolveCurrentRow(input.bulkState);
  const currentUrl = urls[globalCurrentRow] ?? input.bulkState.currentUrl?.trim() ?? "";
  const currentKey = currentUrl ? normalizePageUrlKey(currentUrl) : "";
  const currentRowOnPage = currentKey
    ? pageUrls.findIndex((url) => normalizePageUrlKey(url) === currentKey)
    : -1;
  const currentRow = useLiveGrid
    ? currentRowOnPage
    : !paginate
      ? globalCurrentRow
      : globalCurrentRow >= pageStart && globalCurrentRow < pageEnd
        ? globalCurrentRow - pageStart
        : -1;

  const fullHarnessByRow = buildHarnessByRow(input.bulkState, input.overviewRows);
  const fullFilesByRow = buildFilesByRow(input);
  const { harnessByRow, filesByRow } = attachPageArtifactsByUrl(
    pageUrls,
    urls,
    fullHarnessByRow,
    fullFilesByRow,
  );

  return {
    displayRows,
    currentRow,
    harnessByRow,
    filesByRow,
    totalRows,
    detailsPageStart: pageStart,
  };
}

export function buildContentOptimizerBulkGeneratorDetailsProps(
  input: ContentOptimizerBulkGeneratorBindingsInput,
  workspaceBusy: boolean,
): BulkGeneratorDetailsPanelProps {
  const urls = input.bulkState.urls ?? [];
  const pageSlice = sliceBulkDetailsToPage(input);
  const isProcessing = resolveBulkRunIsProcessing(input);
  const status = contentOptimizerLiveStatus(input);
  const headerProgress = contentOptimizerHeaderProgressFromRun(input);
  const downloadManager = new OptimizationFileManagerClass();
  const researchRowIndices = buildResearchRowIndexSet(input.bulkState, input.overviewRows);
  const usesResearchPipeline = bulkStateUsesResearchPipeline(input.bulkState);
  const simpleAiseoTitles = resolveSimpleAiseoBatchPipelineTitles(input.bulkState.runKind);
  const currentRowIndex = resolveCurrentRow(input.bulkState);
  const currentUrl = input.bulkState.urls?.[currentRowIndex]?.trim();
  const currentRowHarness = currentUrl
    ? harnessSectionsForUrl(input.bulkState.urlHarnessSections, currentUrl)
    : undefined;
  const currentRowFiles = currentUrl
    ? generatedFilesForUrl(input.bulkState.urlGeneratedFiles, currentUrl)
    : [];
  const currentOverviewRow = currentUrl
    ? overviewRowByUrl(input.overviewRows).get(normalizePageUrlKey(currentUrl))
    : undefined;
  const currentArticleTitle = sanitizeHarnessArticleTitle(
    currentOverviewRow?.title?.trim() ||
      currentOverviewRow?.aiTitle?.trim() ||
      (currentUrl ? input.bulkState.urlKeywords?.[currentUrl]?.trim() : "") ||
      "",
    { pageUrl: currentUrl, keyword: currentUrl ? input.bulkState.urlKeywords?.[currentUrl] : undefined },
  );
  const mergedCurrentHarness = isAiseoFileSlotRunKind(input.bulkState.runKind)
      ? ((currentRowHarness ?? []) as BulkHarnessSectionUi[])
      : mergeContentOptimizeHarnessSections(
          currentRowHarness,
          currentRowFiles,
          currentArticleTitle,
          currentUrl,
          currentUrl ? input.bulkState.urlKeywords?.[currentUrl] : undefined,
          currentUrl && typeof input.bulkState.urlEntities?.[currentUrl] === "string"
            ? input.bulkState.urlEntities[currentUrl]
            : undefined,
        );

  return {
    variant: "csv",
    workspaceBusy,
    headerProgress,
    isProcessing,
    status,
    runKind: usesResearchPipeline ? "research" : input.bulkState.runKind,
    researchBatchSignals: researchBatchSignals(input.bulkState),
    researchRowIndices,
    pipelineSectionTitles: usesResearchPipeline
      ? [...RESEARCH_HARNESS_PIPELINE_TITLES]
      : isAiseoFileSlotRunKind(input.bulkState.runKind)
        ? []
        : simpleAiseoTitles
          ? [...simpleAiseoTitles]
          : [...resolveContentOptimizePipelineTitlesForRow(mergedCurrentHarness, currentRowFiles, currentArticleTitle)],
    harnessSections: liveHarnessSections(input),
    harnessByRow: pageSlice.harnessByRow,
    batchPrepHarnessSections: [],
    harnessPlannedSectionCount: harnessPlannedSectionCount(input),
    currentRow: pageSlice.currentRow,
    totalRows: pageSlice.totalRows,
    displayRows: pageSlice.displayRows,
    detailsPageStart: pageSlice.detailsPageStart,
    postDestination: "wordpress",
    wpConfig: null,
    filesByRow: pageSlice.filesByRow,
    downloadFile: (file) => {
      downloadManager.downloadFile({
        name: file.fileName,
        content: file.content,
        mimeType: file.mimeType,
      });
    },
    urlStatuses: input.bulkState.urlStatuses,
  };
}
