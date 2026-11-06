import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import {
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
  type BlogImportHeaderProgress,
} from "@/lib/bulk/blog-import-header-progress";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import {
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { OptimizationFileManager as OptimizationFileManagerClass } from "@/lib/optimization-file-manager";
import {
  buildWaitingResearchHarnessSections,
  RESEARCH_HARNESS_PIPELINE_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-research-harness-sections";
import {
  buildResearchRowIndexSet,
  isAiseoSimpleHarnessRunKind,
  isResearchBatchState,
  resolveSimpleAiseoBatchPipelineTitles,
  rowHarnessIsResearch,
  type ResearchBatchSignals,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  buildPredeterminedBlogBodyHarnessTitles,
  buildWaitingContentOptimizeHarnessSections,
  extractBodyHarnessTitlesFromSections,
  extractBodyHarnessTitlesFromRowFiles,
  isUrlLikeHarnessTitle,
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

const CONTENT_OPTIMIZER_RUN_LABEL = "Content Optimizer";

export function isContentOptimizerBulkRun(
  batchState: BulkOptimizationState | null | undefined,
): boolean {
  if (!batchState?.urls?.length) return false;
  const kind = batchState.runKind;
  return !kind || kind === "content";
}

function toHarnessUi(
  sections: OptimizationProgressState["harnessSections"] | undefined,
): BulkHarnessSectionUi[] {
  return (sections ?? []) as BulkHarnessSectionUi[];
}

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

function overviewRowByUrl(rows: OverviewRow[]): Map<string, OverviewRow> {
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

function optimizationFilesToBulkGenerated(
  files: Array<{ name: string; content: string; mimeType: string }>,
  rowIndex: number,
  row: CSVRow,
): BulkGeneratedFile[] {
  const ts = Date.now();
  return files.map((file, fileIndex) => ({
    id: `co-${rowIndex}-${fileIndex}-${file.name}`,
    rowIndex,
    fileName: file.name,
    content: file.content,
    mimeType: file.mimeType,
    status: "completed" as const,
    timestamp: ts + fileIndex,
    rowData: {
      keyword: row.keyword,
      entity: row.entity,
      title: row.title,
      meta_description: row.meta_description,
    },
  }));
}

function buildFilesByRow(input: ContentOptimizerBulkGeneratorBindingsInput): Map<number, BulkGeneratedFile[]> {
  const { bulkState, siteId, siteProgress, optimizationFileManagers } = input;
  const urls = bulkState.urls ?? [];
  const rowByUrl = overviewRowByUrl(input.overviewRows);
  const activeUrl = bulkState.currentUrl?.trim();
  const activeKey = activeUrl ? normalizePageUrlKey(activeUrl) : "";
  const map = new Map<number, BulkGeneratedFile[]>();

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]!;
    const overviewRow = rowByUrl.get(normalizePageUrlKey(url));
    const csvRow = overviewRowToCsvRow(overviewRow, url, bulkState);
    const persisted = generatedFilesForUrl(bulkState.urlGeneratedFiles, url);
    const isActive = activeKey && normalizePageUrlKey(url) === activeKey;
    const live =
      isActive && siteProgress?.generatedFiles?.length
        ? siteProgress.generatedFiles.map((f) => ({
            name: f.name,
            content: f.content,
            mimeType: f.mimeType,
          }))
        : [];
    const merged = mergeGeneratedFilesByName(persisted, live);
    const rowFiles = isAiseoFileSlotRunKind(bulkState.runKind)
      ? filterAiseoRowDisplayFiles(bulkState.runKind, merged)
      : merged;
    if (rowFiles.length > 0) {
      map.set(index, optimizationFilesToBulkGenerated(rowFiles, index, csvRow));
    }
  }

  const fm = optimizationFileManagers[siteId];
  if (isContentOptimizerBulkRun(bulkState) && fm && fm.getFileCount() > 0 && activeUrl) {
    const activeIndex = urls.findIndex((u) => normalizePageUrlKey(u) === activeKey);
    if (activeIndex >= 0) {
      const overviewRow = rowByUrl.get(normalizePageUrlKey(urls[activeIndex]!));
      const row = overviewRowToCsvRow(overviewRow, urls[activeIndex]!, bulkState);
      const fromFm = fm.getFiles().map((f) => ({
        name: f.name,
        content: f.content,
        mimeType: f.mimeType,
      }));
      const merged = mergeGeneratedFilesByName(
        map.get(activeIndex)?.map((f) => ({
          name: f.fileName,
          content: f.content,
          mimeType: f.mimeType,
        })) ?? [],
        fromFm,
      );
      map.set(activeIndex, optimizationFilesToBulkGenerated(merged, activeIndex, row));
    }
  }

  return map;
}

function harnessSectionsForUrl(
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

function harnessBodyIntroLooksLikeUrl(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (/^How https?:\/\//i.test(trimmed)) return true;
  return isUrlLikeHarnessTitle(trimmed);
}

export function mergeContentOptimizeHarnessSections(
  stored: BulkHarnessSectionUi[] | undefined,
  rowFiles?: Array<{ name?: string; fileName?: string; content?: string }>,
  articleTitle?: string,
  pageUrl?: string,
  keyword?: string,
  entity?: string,
  isSap?: boolean,
): BulkHarnessSectionUi[] {
  const fromHarness = extractBodyHarnessTitlesFromSections(stored);
  const fromFiles = extractBodyHarnessTitlesFromRowFiles(rowFiles);
  const harnessHasBadIntro = Boolean(fromHarness[0] && harnessBodyIntroLooksLikeUrl(fromHarness[0]));
  const safeArticleTitle = sanitizeHarnessArticleTitle(articleTitle ?? "", { pageUrl, keyword });
  const templateTitles = buildPredeterminedBlogBodyHarnessTitles(safeArticleTitle, undefined, {
    pageUrl,
    keyword,
    entity,
    isSap,
  });
  const bodyTitles =
    templateTitles.length > 0
      ? templateTitles
      : fromHarness.length > 0 && !harnessHasBadIntro
        ? fromHarness
        : fromFiles;
  const waiting = buildWaitingContentOptimizeHarnessSections(bodyTitles).map((section, sectionIndex) => ({
    ...section,
    sectionIndex,
  })) as BulkHarnessSectionUi[];
  if (!stored?.length) return waiting;
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of stored) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section) => {
    const patch = statusByTitle.get(section.title);
    return patch ? { ...patch, sectionIndex: section.sectionIndex, title: section.title } : section;
  });
}

function mergeResearchHarnessSections(
  stored: BulkHarnessSectionUi[] | undefined,
): BulkHarnessSectionUi[] {
  const waiting = buildWaitingResearchHarnessSections().map((section, sectionIndex) => ({
    ...section,
    sectionIndex,
  })) as BulkHarnessSectionUi[];
  if (!stored?.length || !rowHarnessIsResearch(stored)) return waiting;
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of stored) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section, sectionIndex) => {
    const patch = statusByTitle.get(section.title);
    return patch ? { ...patch, sectionIndex } : section;
  });
}

function buildHarnessByRow(
  bulkState: BulkOptimizationState,
  overviewRows: OverviewRow[],
): Map<number, BulkHarnessSectionUi[]> {
  const map = new Map<number, BulkHarnessSectionUi[]>();
  const urls = bulkState.urls ?? [];
  const byUrl = bulkState.urlHarnessSections ?? {};
  const filesByUrl = bulkState.urlGeneratedFiles ?? {};
  const researchBatch = bulkState.runKind === "research";
  const rowByUrl = overviewRowByUrl(overviewRows);

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]!;
    const stored = harnessSectionsForUrl(byUrl, url);
    const rowFiles = generatedFilesForUrl(filesByUrl, url);
    const overviewRow = rowByUrl.get(normalizePageUrlKey(url));
    const articleTitle =
      sanitizeHarnessArticleTitle(
        overviewRow?.title?.trim() ||
          overviewRow?.aiTitle?.trim() ||
          bulkState.urlKeywords?.[url]?.trim() ||
          "",
        { pageUrl: url, keyword: bulkState.urlKeywords?.[url] },
      );
    if (researchBatch) {
      map.set(index, mergeResearchHarnessSections(stored));
    } else if (isAiseoFileSlotRunKind(bulkState.runKind)) {
      map.set(index, (stored ?? []) as BulkHarnessSectionUi[]);
    } else {
      map.set(index, mergeContentOptimizeHarnessSections(
        stored,
        rowFiles,
        articleTitle,
        url,
        bulkState.urlKeywords?.[url],
        typeof bulkState.urlEntities?.[url] === "string" ? bulkState.urlEntities[url] : undefined,
      ));
    }
  }
  return map;
}

function resolveCurrentRow(bulkState: BulkOptimizationState): number {
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

function liveHarnessSections(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): BulkHarnessSectionUi[] {
  const fromProgress = toHarnessUi(
    input.siteProgress?.harnessSections ?? input.batchProgress?.harnessSections,
  );
  const currentRow = resolveCurrentRow(input.bulkState);
  const currentUrl = input.bulkState.urls?.[currentRow]?.trim();
  const fromBulkUrl = currentUrl
    ? toHarnessUi(harnessSectionsForUrl(input.bulkState.urlHarnessSections, currentUrl))
    : [];
  if (!fromBulkUrl.length) return fromProgress;
  if (!fromProgress.length) return fromBulkUrl;
  const byTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of fromBulkUrl) {
    const title = section.title?.trim();
    if (title) byTitle.set(title, section);
  }
  for (const section of fromProgress) {
    const title = section.title?.trim();
    if (title) byTitle.set(title, section);
  }
  return [...byTitle.values()];
}

function harnessPlannedSectionCount(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): number | null {
  const planned =
    input.siteProgress?.harnessPlannedSectionCount ??
    input.batchProgress?.harnessPlannedSectionCount ??
    null;
  return typeof planned === "number" && planned > 0 ? planned : null;
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
