import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { BulkOptimizationState } from "@/hooks/use-content-optimization";
import type { GscPerformancePreviewSnapshot } from "@/hooks/content-optimization/gsc-preview-types";
import {
  CONTENT_OPTIMIZER_URL_STEPS,
  stepLabel,
  type ContentOptimizerStepId,
} from "@/lib/content-optimization/content-optimizer-step-labels";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { CONTENT_OPTIMIZE_PIPELINE_TOTAL } from "@/lib/overview/overview-content-optimize-pipeline";
import { shouldShowDetailsFlatGeneratedFiles } from "@/lib/overview/overview-peer-csv-details";

export type BulkPanelVariant = "modal" | "page";
export type BulkPanelDisplayMode = "full" | "details-only";

export interface BulkOptimizationPanelProps {
  variant: BulkPanelVariant;
  /** Overview header accordion: per-URL details without duplicate title/progress chrome. */
  displayMode?: BulkPanelDisplayMode;
  bulkState: BulkOptimizationState | null;
  batchKey: string;
  onApproveKeywords?: (batchKey: string) => void;
  /** Live progress: prefer `optimizationProgress[siteId]` (harness rows); batch key is fallback */
  siteProgress?: {
    stepId?: ContentOptimizerStepId;
    step: string;
    progress: number;
    message?: string;
    harnessSections?: BulkHarnessSectionUi[];
    harnessPlannedSectionCount?: number | null;
    generatedFiles?: Array<{ name: string; content: string; mimeType: string }>;
  };
  onRequestClose: (opts?: { abortingRun?: boolean }) => void;
  /** Shown when variant is "page" */
  pageTitle?: string;
  pageSubtitle?: string;
  /** GSC query snapshots per target URL (same URL strings as bulk rows). */
  gscPreviewByUrl?: Record<string, GscPerformancePreviewSnapshot | null>;
  /** Current bulk target URL - used with `gscFetching` for inline loading row. */
  gscActiveUrl?: string | null;
  /** Batch progress is on GSC step for the active URL. */
  gscFetching?: boolean;
  /** Overview bucket: entity detail only shown for SAP runs. */
  sitemapSource?: OverviewSitemapSource;
  /** Overview: start WordPress upload after AI All Meta completes. */
  onUploadToWordPress?: () => void;
  /** Sitemap merge publish: destination URL → live permalink after WordPress upload. */
  publishedLinksByUrl?: Record<string, string>;
  wpTitlesByUrl?: Record<string, string>;
  overviewRows?: OverviewRow[];
  onRowDateModifierChange?: (url: string, dateIso: string) => void;
  onRowDateModifierCommit?: (url: string) => void;
}

export const URL_STEP_PILLS = CONTENT_OPTIMIZER_URL_STEPS.map((s) => ({
  key: s.id,
  shortLabel: s.label,
}));

export function bulkRowLinkLabel(url: string, keyword?: string): string {
  const kw = keyword?.trim();
  if (kw) return kw;
  return humanizeSlugFromUrl(url) || url;
}

export function mergeRowHarnessSections(
  persisted: BulkHarnessSectionUi[] | undefined,
  live: BulkHarnessSectionUi[] | undefined,
  isActive: boolean,
  isParallelHarnessRow: boolean,
): BulkHarnessSectionUi[] | undefined {
  if (isParallelHarnessRow) return persisted?.length ? persisted : undefined;
  const prep = persisted ?? [];
  if (!isActive || !live?.length) {
    return prep.length ? prep : undefined;
  }
  const prepCount = prep.length;
  const contentSections = live.map((s, i) => ({
    ...s,
    sectionIndex: prepCount + (s.sectionIndex ?? i),
  }));
  return [...prep, ...contentSections];
}

export function resolveRowHarnessPlannedCount(
  merged: BulkHarnessSectionUi[] | undefined,
  isParallelHarnessRow: boolean,
  isActive: boolean,
  livePlanned: number | null | undefined,
  persistedLength: number,
): number | null {
  if (isParallelHarnessRow) {
    return merged?.length ?? null;
  }
  const prepCount = persistedLength || CONTENT_OPTIMIZE_PIPELINE_TOTAL;
  const contentPlanned =
    isActive && typeof livePlanned === "number" && livePlanned > 0 ? livePlanned : 0;
  const total = prepCount + contentPlanned;
  if (total > 0) return total;
  return merged?.length ?? null;
}

export function sortFilesForDisplay(files: { name: string; content: string; mimeType: string }[]) {
  const order = [
    "gsc-data",
    "wordpress-post-download",
    "checklist",
    "blueprint",
    "content",
    "meta-optimization",
    "meta-",
    "keyword-research",
    "selected-keyword",
    "featured-image-checklist",
    "featured-image",
  ];
  const score = (name: string) => {
    for (let i = 0; i < order.length; i++) {
      if (name.startsWith(order[i])) return i;
    }
    return order.length;
  };
  return [...files].sort((a, b) => score(a.name) - score(b.name));
}

export interface BulkTargetRowStateInput {
  url: string;
  localIndex: number;
  showBulkPagination: boolean;
  visibleStart: number;
  urlStatuses: BulkOptimizationState["urlStatuses"];
  currentIndex: number;
  isParallelHarnessRow: boolean;
  allComplete: boolean;
  urlLocalImageOutcomes: NonNullable<BulkOptimizationState["urlLocalImageOutcomes"]>;
  urlGeneratedFiles: NonNullable<BulkOptimizationState["urlGeneratedFiles"]>;
  warmingUpIndex: number | null;
  warmingUpIndex2: number | null;
  researchedUrls: string[];
  prepStepLower: string;
  postProgress: number;
  isInContentImageRun: boolean;
  showEntityDetail: boolean;
  urlEntities: NonNullable<BulkOptimizationState["urlEntities"]>;
  expandedUrls: Set<string>;
  urlKeywords: Record<string, string>;
  urlHarnessSections: NonNullable<BulkOptimizationState["urlHarnessSections"]>;
  currentStepProgress:
    | BulkOptimizationPanelProps["siteProgress"]
    | BulkOptimizationState["currentStepProgress"];
  isDetailsOnly: boolean;
  detailsCurrentIndex: number;
  currentStepId: ContentOptimizerStepId;
}

export function deriveBulkTargetRowState(input: BulkTargetRowStateInput) {
  const {
    url, localIndex, showBulkPagination, visibleStart, urlStatuses, currentIndex,
    isParallelHarnessRow, allComplete, urlLocalImageOutcomes, urlGeneratedFiles,
    warmingUpIndex, warmingUpIndex2, researchedUrls, prepStepLower, postProgress,
    isInContentImageRun, showEntityDetail, urlEntities, expandedUrls, urlKeywords,
    urlHarnessSections, currentStepProgress, isDetailsOnly, detailsCurrentIndex,
    currentStepId,
  } = input;

  const index = showBulkPagination ? visibleStart + localIndex : localIndex;
  const status =
    urlStatuses[url] ||
    (index < currentIndex
      ? "completed"
      : index === currentIndex
        ? "optimizing"
        : "pending");
  const isActive = isParallelHarnessRow
    ? status === "optimizing" && !allComplete
    : index === currentIndex && status === "optimizing" && !allComplete;
  const isCompleted = status === "completed";
  const isSkipped = status === "skipped";
  const isError = status === "error";
  const isPending = status === "pending";
  const localImageOutcome = urlLocalImageOutcomes[url];
  const rowGeneratedFiles = generatedFilesForUrl(urlGeneratedFiles, url);
  const isWarmingUp =
    !isParallelHarnessRow &&
    ((warmingUpIndex !== null && index === warmingUpIndex) ||
      (warmingUpIndex2 !== null && index === warmingUpIndex2)) &&
    !isActive;
  const isReady =
    !isParallelHarnessRow && isPending && !isWarmingUp && researchedUrls.includes(url);
  const showActiveRowBorder =
    isActive && !isCompleted && !isSkipped && !isError;

  const getStatusLabel = () => {
    if (isParallelHarnessRow && isActive) return "RUNNING";
    if (
      isParallelHarnessRow &&
      status === "optimizing" &&
      prepStepLower.includes("uploading to wordpress")
    ) {
      return "UPLOAD";
    }
    if (isParallelHarnessRow && isCompleted) {
      if (isInContentImageRun) {
        if (localImageOutcome === "found") return "FOUND";
        if (localImageOutcome === "generated") return "GENERATED";
      }
      return "DONE";
    }
    if (isParallelHarnessRow && isError) return "FAILED";
    if (isParallelHarnessRow && isSkipped) return "SKIPPED";
    if (isParallelHarnessRow && isPending) return "WAITING";
    if (isActive && prepStepLower.includes("validating links")) return "VALIDATE";
    if (isActive && prepStepLower.includes("ensuring links")) return "LINKS";
    if (isActive && prepStepLower.includes("generating extra text"))
      return "EXTRA TEXT";
    if (isActive && prepStepLower.includes("generating meta")) return "META";
    if (isActive && prepStepLower.includes("uploading to wordpress")) return "UPLOAD";
    if (isActive) return `${postProgress}%`;
    if (status === "optimizing" && prepStepLower.includes("validating links"))
      return "VALIDATE";
    if (status === "optimizing" && prepStepLower.includes("ensuring links"))
      return "LINKS";
    if (status === "optimizing" && prepStepLower.includes("generating extra text"))
      return "EXTRA TEXT";
    if (status === "optimizing" && prepStepLower.includes("generating meta"))
      return "META";
    if (status === "optimizing" && prepStepLower.includes("uploading to wordpress"))
      return "UPLOAD";
    if (isWarmingUp) return "RESEARCH";
    if (isReady) return "READY";
    if (isCompleted) return "DONE";
    if (isSkipped) return "SKIPPED";
    if (isError) return "FAILED";
    return "WAITING";
  };

  const keyword = urlKeywords[url];

  const isExpanded = expandedUrls.has(url);
  const closedOutcomeLabel =
    isInContentImageRun && !isExpanded
      ? localImageOutcome === "found"
        ? "Found"
        : localImageOutcome === "generated"
          ? "Generated"
          : isSkipped
            ? "Skipped"
            : isError
              ? "Failed"
              : isCompleted
                ? "Done"
                : null
      : null;
  const entityLabel =
    showEntityDetail && urlEntities[url] && urlEntities[url] !== "N/A"
      ? urlEntities[url]
      : null;

  const persistedHarness = urlHarnessSections[url] as BulkHarnessSectionUi[] | undefined;
  const liveHarness =
    isActive && !isParallelHarnessRow
      ? (currentStepProgress?.harnessSections as BulkHarnessSectionUi[] | undefined)
      : undefined;
  const rowHarnessSectionsList = mergeRowHarnessSections(
    persistedHarness,
    liveHarness,
    isActive,
    isParallelHarnessRow,
  );
  const showRowHarness = Boolean(rowHarnessSectionsList?.length);
  const showHarnessForRow = isParallelHarnessRow
    ? isActive || isCompleted || isSkipped || isError
    : isDetailsOnly
      ? showRowHarness
      : showRowHarness && (isActive || isCompleted || isWarmingUp || isReady);

  const isDetailsActivePost =
    isDetailsOnly &&
    !allComplete &&
    !isCompleted &&
    !isSkipped &&
    !isError &&
    index === detailsCurrentIndex;

  const showOptimizationSequence =
    !isParallelHarnessRow &&
    (isActive ||
      isWarmingUp ||
      (isDetailsOnly &&
        (isDetailsActivePost || isCompleted || isSkipped || isError)));

  const showDetailsFlatBody = shouldShowDetailsFlatGeneratedFiles({
    isDetailsOnly,
    showOptimizationSequence,
    harnessSectionCount: rowHarnessSectionsList?.length ?? 0,
    generatedFileCount: generatedFilesForUrl(urlGeneratedFiles, url).length,
    peerSiteCount: 0,
    isActive,
    isWarmingUp,
    isDetailsActivePost,
    isCompleted,
    isSkipped,
    isError,
  });

  const isDetailsCurrentRow =
    isDetailsOnly &&
    !allComplete &&
    index === detailsCurrentIndex &&
    !isCompleted &&
    !isSkipped &&
    !isError;

  const detailsStepLabel = isDetailsCurrentRow
    ? stepLabel(currentStepId)
    : null;
  return {
    index, status, isActive, isCompleted, isSkipped, isError, isPending,
    localImageOutcome, rowGeneratedFiles, isWarmingUp, isReady,
    showActiveRowBorder, getStatusLabel, keyword, isExpanded,
    closedOutcomeLabel, entityLabel, persistedHarness, liveHarness,
    rowHarnessSectionsList, showRowHarness, showHarnessForRow,
    isDetailsActivePost, showOptimizationSequence, showDetailsFlatBody,
    isDetailsCurrentRow, detailsStepLabel,
  };
}

export const downloadFile = (file: { name: string; content: string; mimeType: string }) => {
  // Re-use OptimizationFileManager download logic to avoid duplicating blob handling
  const tempManager = new OptimizationFileManager();
  tempManager.downloadFile(file);
};

export const downloadAllForUrl = (files: { name: string; content: string; mimeType: string }[]) => {
  const sorted = sortFilesForDisplay(files);
  sorted.forEach((file, index) => {
    setTimeout(() => downloadFile(file), index * 250);
  });
};

export const downloadFileForUrl = (
  url: string,
  file: { name: string; content: string; mimeType: string },
) => {
  const slug = humanizeSlugFromUrl(url).replace(/\s+/g, "-").slice(0, 48) || "target";
  downloadFile({ ...file, name: `${slug}-${file.name}` });
};

export function buildBulkRunReport(input: {
  urls: string[];
  completedCount: number;
  skippedCount: number;
  errorCount: number;
  optimizedUrls: string[];
  escapedUrls: string[];
  deflectedUrls: string[];
  urlKeywords: Record<string, string>;
  urlEntities: Record<string, string>;
  urlGeneratedFiles: NonNullable<BulkOptimizationState["urlGeneratedFiles"]>;
}): string {
  const {
    urls, completedCount, skippedCount, errorCount, optimizedUrls, escapedUrls,
    deflectedUrls, urlKeywords, urlEntities, urlGeneratedFiles,
  } = input;

  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    '              BULK RUN REPORT                              ',
    '═══════════════════════════════════════════════════════════',
    `Generated: ${new Date().toLocaleString()}`,
    '',
    '───────────────────────────────────────────────────────────',
    '                        SUMMARY                            ',
    '───────────────────────────────────────────────────────────',
    `Total URLs:     ${urls.length}`,
    `Completed:      ${completedCount}`,
    `Skipped:        ${skippedCount}`,
    `Failed:         ${errorCount}`,
    '',
  ];

  if (optimizedUrls.length > 0) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('                   COMPLETED URLS                          ');
    lines.push('───────────────────────────────────────────────────────────');
    optimizedUrls.forEach((url, i) => {
      const files = generatedFilesForUrl(urlGeneratedFiles, url);
      lines.push(`${i + 1}. ${url}`);
      lines.push(`   Keyword: ${urlKeywords[url] || 'N/A'}`);
      lines.push(`   Entity:  ${urlEntities[url] || 'N/A'}`);
      if (files.length > 0) {
        lines.push(`   Files:   ${files.length} generated`);
        const sorted = sortFilesForDisplay(files);
        sorted.forEach((f) => {
          lines.push(`     - ${f.name}`);
        });
      }
      lines.push('');
    });
  }

  if (escapedUrls.length > 0) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('         SKIPPED URLS (Keyword research failed)            ');
    lines.push('───────────────────────────────────────────────────────────');
    escapedUrls.forEach((url, i) => {
      lines.push(`${i + 1}. ${url}`);
      lines.push(
        '   Reason: Could not derive keyword from sitemap or page context',
      );
      lines.push('');
    });
  }

  if (deflectedUrls.length > 0) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('                 FAILED URLS (Errors)                      ');
    lines.push('───────────────────────────────────────────────────────────');
    deflectedUrls.forEach((url, i) => {
      lines.push(`${i + 1}. ${url}`);
      lines.push('   Error: Processing failed');
      lines.push('');
    });
  }

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('                    END OF REPORT                          ');
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

export function buildBulkRunCsv(input: {
  urls: string[];
  urlStatuses: BulkOptimizationState["urlStatuses"];
  urlKeywords: Record<string, string>;
  urlEntities: Record<string, string>;
  urlSerpResearchReady: Record<string, boolean>;
}): string {
  const { urls, urlStatuses, urlKeywords, urlEntities, urlSerpResearchReady } = input;

  const headers = ['URL', 'Status', 'Keyword', 'Entity', 'SEO brief ready'];
  const rows = urls.map(url => {
    const status = urlStatuses[url] || 'pending';
    const statusLabel = status === 'completed' ? 'Destroyed' : 
                        status === 'skipped' ? 'Escaped' : 
                        status === 'error' ? 'Deflected' : 'Standing By';
    return [
      url,
      statusLabel,
      urlKeywords[url] || '',
      urlEntities[url] || '',
      urlSerpResearchReady[url] ? 'yes' : 'no',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}
