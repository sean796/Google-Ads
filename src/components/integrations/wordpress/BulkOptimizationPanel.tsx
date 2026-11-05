import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertCircle, Circle, CircleDot, Copy, Download, FileText, FileDown, Map as MapIcon, MinusCircle, Upload, X, ChevronDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COPIED_TO_CLIPBOARD, NOTIFY_CSV_DOWNLOADED, NOTIFY_REPORT_COPIED_TO_CLIPBOARD } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import { OptimizationProgressInlineStatus } from "@/components/overview/overview-tab/OptimizationProgressInlineStatus";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { BulkOptimizationState } from "@/hooks/use-content-optimization";
import type { GscPerformancePreviewSnapshot } from "@/hooks/content-optimization/gsc-preview-types";
import {
  CONTENT_OPTIMIZER_URL_STEPS,
  stepLabel,
  urlStepIndex,
  type ContentOptimizerStepId,
} from "@/lib/content-optimization/content-optimizer-step-labels";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { GscPerformancePreviewRow } from "@/components/integrations/wordpress/GscPerformancePreviewRow";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import { OptimizationArtifactDownloads } from "./OptimizationArtifactDownloads";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageCount,
  contentOptimizerBulkPageForIndex,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimizer/content-optimizer-bulk-page-size";
import { OverviewGridPagination } from "@/components/overview/OverviewGridPagination";
import {
  mergeGeneratedFilesByName,
  partitionPeerDetailFiles,
  shouldShowDetailsFlatGeneratedFiles,
} from "@/lib/overview/overview-peer-csv-details";
import { BULK_ACTIVE_SEMANTIC_BORDER_CLASS } from "@/lib/bulk/bulk-active-semantic-border";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { MetaOptimizerPageRowCompact } from "@/components/overview/MetaOptimizerPageRowCompact";
import {
  MetaAccordionStripeRow,
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
  META_TRIGGER_FLAT,
  zoneMetaAccordionStack,
} from "@/components/overview/MetaOptimizerPageRowDetails";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { isOverviewRowBulkActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import {
  CONTENT_PREP_BATCH_SECTION_TITLES,
  CONTENT_PREP_ENTITY_SAP_BATCH_SECTION_TITLES,
} from "@/lib/overview/overview-content-prep-harness-sections";
import { CONTENT_OPTIMIZE_PIPELINE_TOTAL } from "@/lib/overview/overview-content-optimize-pipeline";

function bulkRowLinkLabel(url: string, keyword?: string): string {
  const kw = keyword?.trim();
  if (kw) return kw;
  return humanizeSlugFromUrl(url) || url;
}

function mergeRowHarnessSections(
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

function resolveRowHarnessPlannedCount(
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

function sortFilesForDisplay(files: { name: string; content: string; mimeType: string }[]) {
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

import {
  BulkDetailsDrawerStack,
  BulkDetailsTileSections,
  resolveDetailsPipelineSections,
  resolveSerpBriefDownloadable,
} from "@/components/shared/bulk-details-tile-sections";
import { resolveBulkRowPipelineTitles, isAiseoSimpleHarnessRunKind } from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  buildAiseoRowDisplaySections,
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveOverviewBulkPipelineTitles } from "@/lib/overview/overview-bulk-details-bindings";
import { Button, RowButton } from "@/ui";

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

const URL_STEP_PILLS = CONTENT_OPTIMIZER_URL_STEPS.map((s) => ({
  key: s.id,
  shortLabel: s.label,
}));

const TargetingSequence: React.FC<{ currentStepIndex: number; flat?: boolean }> = ({
  currentStepIndex,
  flat = false,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {URL_STEP_PILLS.map((step, index) => {
        const isCompleted = currentStepIndex > index;
        const isCurrent = currentStepIndex === index;

        return (
          <span
            key={step.key}
            className={cn(
              "font-mono text-sm transition-all",
              flat
                ? cn("text-white", isCurrent && "font-semibold")
                : cn(
                    "rounded px-1.5 py-0.5",
                    isCompleted && "bg-primary/15 text-primary",
                    isCurrent && "bg-primary/25 font-semibold text-foreground",
                    currentStepIndex < index && "bg-muted text-muted-foreground",
                  ),
            )}
          >
            {!flat && isCompleted && "✓ "}
            {!flat && isCurrent && "● "}
            {step.shortLabel}
          </span>
        );
      })}
    </div>
  );
};

function BulkProgressBar({
  value,
  indeterminate,
}: {
  value?: number;
  indeterminate?: boolean;
}) {
  if (indeterminate) {
    return (
      <div className="neo-pulse-competitor-progress-track rounded-sm">
        <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
      </div>
    );
  }
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="neo-pulse-competitor-progress-track rounded-sm">
      <div
        className="neo-pulse-competitor-progress-fill rounded-sm transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

export const BulkOptimizationPanel: React.FC<BulkOptimizationPanelProps> = ({
  variant,
  displayMode = "full",
  bulkState,
  batchKey,
  onApproveKeywords,
  siteProgress,
  onRequestClose,
  pageTitle,
  pageSubtitle,
  gscPreviewByUrl = {},
  gscActiveUrl = null,
  gscFetching = false,
  sitemapSource,
  onUploadToWordPress,
  publishedLinksByUrl = {},
  wpTitlesByUrl = {},
  overviewRows = [],
  onRowDateModifierChange,
  onRowDateModifierCommit,
}) => {
  const isDetailsOnly = displayMode === "details-only";
  const drawerDateEditable = isDetailsOnly && Boolean(onRowDateModifierChange);
  // Extract data safely - handle null gracefully
  const urls = bulkState?.urls || [];
  const currentIndex = bulkState?.currentIndex ?? 0;
  const urlStatuses = bulkState?.urlStatuses || {};
  const currentStepId: ContentOptimizerStepId =
    siteProgress?.stepId ??
    (bulkState?.currentStepProgress?.stepId as ContentOptimizerStepId | undefined) ??
    "load";
  const currentStep = siteProgress?.step || bulkState?.currentStep || stepLabel(currentStepId);
  const currentProgress =
    siteProgress?.progress ?? bulkState?.currentProgress ?? bulkState?.currentStepProgress?.progress;
  const currentStepProgress = siteProgress
    ? {
        stepId: siteProgress.stepId,
        step: siteProgress.step,
        progress: siteProgress.progress,
        message: siteProgress.message,
        harnessSections:
          siteProgress.harnessSections ?? bulkState?.currentStepProgress?.harnessSections,
        harnessPlannedSectionCount:
          siteProgress.harnessPlannedSectionCount ??
          bulkState?.currentStepProgress?.harnessPlannedSectionCount,
      }
    : bulkState?.currentStepProgress;
  const urlKeywords = bulkState?.urlKeywords || {};
  const urlSkipReasons = bulkState?.urlSkipReasons || {};
  const urlLocalImageOutcomes = bulkState?.urlLocalImageOutcomes || {};
  const urlSerpResearchReady = bulkState?.urlSerpResearchReady || {};
  const urlEntities = bulkState?.urlEntities || {};
  const isInContentImageRun = bulkState?.runKind === "aiInContentImage";
  const showEntityDetail = sitemapSource === "sap";
  const warmingUpIndex = bulkState?.warmingUpIndex ?? null;
  const warmingUpIndex2 = bulkState?.warmingUpIndex2 ?? null;
  const researchedUrls = bulkState?.researchedUrls ?? [];

  const completedCount = Object.values(urlStatuses).filter(status => status === 'completed').length;
  const skippedCount = Object.values(urlStatuses).filter(status => status === 'skipped').length;
  const errorCount = Object.values(urlStatuses).filter(status => status === 'error').length;
  const totalCount = urls.length;
  const processedCount = completedCount + skippedCount + errorCount;
  const allComplete = processedCount === totalCount && totalCount > 0;
  const bulkPageSize = bulkState?.bulkPageSize ?? CONTENT_OPTIMIZER_BULK_PAGE_SIZE;
  const totalBulkPages =
    bulkState?.totalBulkPages ??
    (contentOptimizerBulkUsesPagination(totalCount) ? contentOptimizerBulkPageCount(totalCount) : 1);
  const showBulkPagination = totalBulkPages > 1;
  const activePageFromProgress = contentOptimizerBulkPageForIndex(currentIndex, bulkPageSize);
  const harnessPagesDone = Math.min(processedCount, totalCount);
  const harnessPagesPct =
    totalCount > 0 ? Math.min(100, Math.round((harnessPagesDone / totalCount) * 100)) : 0;

  const prepStepLower = `${currentStep} ${currentStepProgress?.message || ""}`.toLowerCase();
  const isBulkAiAllMetaRun =
    bulkState?.runKind === "aiAllMeta" || prepStepLower.includes("generating meta");
  const isBulkResearchRun =
    bulkState?.runKind === "research" || prepStepLower.includes("researching");
  const isBulkWpUploadRun =
    bulkState?.runKind === "wpUpload" || prepStepLower.includes("uploading to wordpress");
  const isBulkExtraTextRun =
    bulkState?.runKind === "extraText" || prepStepLower.includes("generating extra text");
  const isBulkAiFaqRun =
    bulkState?.runKind === "aiFaq" || prepStepLower.includes("ai faq");
  const isBulkAiHeadersRun =
    bulkState?.runKind === "aiHeaders" ||
    bulkState?.runKind === "contentCleanup" ||
    bulkState?.runKind === "aiLinks" ||
    bulkState?.runKind === "aiWikipediaLink" ||
    bulkState?.runKind === "aiAnswer" ||
    bulkState?.runKind === "aiOverview" ||
    bulkState?.runKind === "aiScenario" ||
    bulkState?.runKind === "aiInContentImage";
  const isHarnessParallelRun =
    isBulkWpUploadRun ||
    isBulkResearchRun ||
    isBulkAiAllMetaRun ||
    isBulkExtraTextRun ||
    isBulkAiFaqRun ||
    isBulkAiHeadersRun;
  const isParallelHarnessRow =
    isBulkResearchRun ||
    isBulkWpUploadRun ||
    isBulkAiAllMetaRun ||
    isBulkExtraTextRun ||
    isBulkAiFaqRun ||
    isBulkAiHeadersRun;
  const isInitialLoading =
    totalCount > 0 &&
    processedCount === 0 &&
    !allComplete &&
    !isBulkExtraTextRun &&
    !isBulkAiFaqRun &&
    !isBulkAiHeadersRun &&
    !isBulkAiAllMetaRun &&
    !isBulkResearchRun &&
    !isBulkWpUploadRun &&
    (prepStepLower.includes("initializ") ||
      prepStepLower.includes("grepping acf") ||
      prepStepLower.includes("preparing batch") ||
      prepStepLower.includes("loading sitemap") ||
      prepStepLower.includes("loading site") ||
      prepStepLower.includes("loading wordpress") ||
      prepStepLower.includes("validating post links") ||
      prepStepLower.includes("reading acf") ||
      prepStepLower.includes("seo research") ||
      prepStepLower.includes("entity keyword") ||
      prepStepLower.includes("deriving keyword") ||
      prepStepLower.includes("saving keyword") ||
      prepStepLower.includes("keywords listed") ||
      prepStepLower.includes("starting optimization"));

  const prepProgress = Math.min(
    99,
    Math.max(
      0,
      Math.round(
        Number(currentStepProgress?.progress ?? currentProgress ?? 0),
      ),
    ),
  );

  const overallProgress =
    totalCount > 0
      ? isHarnessParallelRun
        ? isInitialLoading || !allComplete
          ? prepProgress
          : Math.round((processedCount / totalCount) * 100)
        : Math.min(
            100,
            Math.max(
              0,
              Number(
                siteProgress?.progress ??
                  bulkState?.currentProgress ??
                  currentStepProgress?.progress ??
                  0,
              ),
            ),
          )
      : 0;

  const initialLoadingMessage =
    currentStepProgress?.message || currentStep || "Preparing bulk run…";

  const postProgress = Math.min(
    100,
    Math.max(0, Number(currentProgress ?? currentStepProgress?.progress ?? 0)),
  );

  const currentStepIndex = urlStepIndex(currentStepId);

  // Get optimized URLs (only completed)
  const optimizedUrls = urls.filter(url => urlStatuses[url] === 'completed');
  const escapedUrls = urls.filter(url => urlStatuses[url] === 'skipped');
  const deflectedUrls = urls.filter(url => urlStatuses[url] === 'error');

  // While optimization is in progress, do not allow closing by clicking outside (X only).
  const isRunning = totalCount > 0 && !allComplete;

  // Generated files per URL (captured from OptimizationFileManager during bulk run)
  const urlGeneratedFiles = bulkState?.urlGeneratedFiles || {};
  const batchPeerLibraryFiles = bulkState?.batchPeerLibraryFiles || [];
  const urlHarnessSections = bulkState?.urlHarnessSections || {};
  const batchPrepHarnessSections = bulkState?.batchPrepHarnessSections;
  const wpUploadBatchHarnessSections = bulkState?.wpUploadBatchHarnessSections;
  const batchInventoryDone =
    !batchPrepHarnessSections?.length ||
    batchPrepHarnessSections.every((section) => section.status === "done");
  const showBatchPrepHarness =
    !isHarnessParallelRun &&
    Boolean(batchPrepHarnessSections?.length) &&
    !batchInventoryDone;
  const showWpUploadBatchHarness =
    isBulkWpUploadRun &&
    Boolean(wpUploadBatchHarnessSections?.length) &&
    (isDetailsOnly || !allComplete);
  const detailsLiveMessage = (
    siteProgress?.message ||
    currentStepProgress?.message ||
    currentStep ||
    ""
  ).trim();

  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(() => new Set());
  /** User-opened row accordions stay open until the user closes them. */
  const pinnedExpandedUrlsRef = useRef<Set<string>>(new Set());
  const [harnessDetailsOpen, setHarnessDetailsOpen] = useState(false);
  const [uiPageIndex, setUiPageIndex] = useState(0);
  const [detailsPrepOpen, setDetailsPrepOpen] = useState(true);

  const setRowExpanded = useCallback((url: string, open: boolean) => {
    if (open) pinnedExpandedUrlsRef.current.add(url);
    else pinnedExpandedUrlsRef.current.delete(url);
    setExpandedUrls((prev) => {
      const next = new Set(prev);
      if (open) next.add(url);
      else next.delete(url);
      return next;
    });
  }, []);

  const mergePinnedExpandedUrls = useCallback((auto: Set<string>): Set<string> => {
    const merged = new Set(auto);
    for (const url of pinnedExpandedUrlsRef.current) merged.add(url);
    return merged;
  }, []);

  const commitAutoExpandedUrls = useCallback(
    (auto: Set<string>) => {
      const merged = mergePinnedExpandedUrls(auto);
      setExpandedUrls((prev) => {
        if (prev.size === merged.size) {
          let same = true;
          for (const u of merged) {
            if (!prev.has(u)) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return merged;
      });
    },
    [mergePinnedExpandedUrls],
  );

  const overviewRowByUrl = useMemo(() => {
    const map = new Map<string, OverviewRow>();
    for (const row of overviewRows) {
      const url = row.url?.trim();
      if (url) map.set(normalizePageUrlKey(url), row);
    }
    return map;
  }, [overviewRows]);

  useEffect(() => {
    setUiPageIndex(activePageFromProgress);
  }, [activePageFromProgress]);

  const visibleStart = uiPageIndex * bulkPageSize;
  const visibleEnd = Math.min(visibleStart + bulkPageSize, totalCount);
  const visibleUrls = showBulkPagination ? urls.slice(visibleStart, visibleEnd) : urls;
  const detailsCurrentIndex =
    typeof bulkState?.currentIndex === "number" ? bulkState.currentIndex : currentIndex;

  useEffect(() => {
    if (batchInventoryDone) setDetailsPrepOpen(false);
  }, [batchInventoryDone]);

  useEffect(() => {
    if (isDetailsOnly) return;
    // Local Image / in-content image: keep Details open so the final report stays visible.
    if (bulkState?.runKind === "aiInContentImage") return;
    if (isHarnessParallelRun && variant === "page" && allComplete) {
      setHarnessDetailsOpen(false);
    }
  }, [allComplete, isHarnessParallelRun, variant, isDetailsOnly, bulkState?.runKind]);

  useEffect(() => {
    // Local Image / In Content Image: only optimizing rows stay open; collapse when done.
    if (bulkState?.runKind === "aiInContentImage") {
      if (allComplete) {
        commitAutoExpandedUrls(new Set());
        return;
      }
      const next = new Set<string>();
      for (const url of urls) {
        if (urlStatuses[url] === "optimizing") next.add(url);
      }
      commitAutoExpandedUrls(next);
      return;
    }

    if (allComplete) {
      commitAutoExpandedUrls(new Set());
      return;
    }

    if (isDetailsOnly) {
      if (isAiseoSimpleHarnessRunKind(bulkState?.runKind)) {
        commitAutoExpandedUrls(new Set());
        return;
      }
      const next = new Set<string>();
      const focusUrl = urls[detailsCurrentIndex]?.trim();
      if (focusUrl) {
        const st = urlStatuses[focusUrl];
        if (st !== "completed" && st !== "skipped" && st !== "error") {
          next.add(focusUrl);
        }
      }
      commitAutoExpandedUrls(next);
      return;
    }

    const next = new Set<string>();
    if (isParallelHarnessRow) {
      for (const url of urls) {
        if (urlStatuses[url] === "optimizing") next.add(url);
      }
    } else {
      const activeUrl = bulkState?.currentUrl?.trim();
      if (activeUrl) {
        const st = urlStatuses[activeUrl];
        if (st !== "completed" && st !== "skipped" && st !== "error") {
          next.add(activeUrl);
        }
      }
      const warmIdx = bulkState?.warmingUpIndex;
      if (warmIdx != null && urls[warmIdx]) {
        const warmUrl = urls[warmIdx]!;
        const st = urlStatuses[warmUrl];
        if (st !== "completed" && st !== "skipped" && st !== "error") {
          next.add(warmUrl);
        }
      }
    }

    commitAutoExpandedUrls(next);
  }, [
    bulkState?.currentUrl,
    bulkState?.warmingUpIndex,
    bulkState?.currentIndex,
    bulkState?.runKind,
    detailsCurrentIndex,
    allComplete,
    isParallelHarnessRow,
    isDetailsOnly,
    urls,
    urlStatuses,
    commitAutoExpandedUrls,
  ]);

  const BULK_ROW_GRID =
    "grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(4.5rem,auto)] items-center gap-3";
  const BULK_ROW_GRID_DETAILS = "flex items-start gap-2";
  const rowGridClass = isDetailsOnly ? BULK_ROW_GRID_DETAILS : BULK_ROW_GRID;

  const downloadFile = (file: { name: string; content: string; mimeType: string }) => {
    // Re-use OptimizationFileManager download logic to avoid duplicating blob handling
    const tempManager = new OptimizationFileManager();
    (tempManager as any).downloadFile(file);
  };

  const downloadAllForUrl = (files: { name: string; content: string; mimeType: string }[]) => {
    const sorted = sortFilesForDisplay(files);
    sorted.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 250);
    });
  };

  const downloadFileForUrl = (
    url: string,
    file: { name: string; content: string; mimeType: string },
  ) => {
    const slug = humanizeSlugFromUrl(url).replace(/\s+/g, "-").slice(0, 48) || "target";
    downloadFile({ ...file, name: `${slug}-${file.name}` });
  };

  // Generate text report
  const generateReport = (): string => {
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
  };

  // Generate CSV
  const generateCSV = (): string => {
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
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReport());
    notify.success(NOTIFY_REPORT_COPIED_TO_CLIPBOARD);
  };

  const handleDownloadCSV = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-run-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(NOTIFY_CSV_DOWNLOADED);
  };

  if (isDetailsOnly) {
    const prepSections =
      batchPrepHarnessSections?.length
        ? batchPrepHarnessSections
        : wpUploadBatchHarnessSections?.length
          ? wpUploadBatchHarnessSections
          : null;

    return (
      <BulkDetailsDrawerStack
        prepSections={prepSections}
        prepOpen={detailsPrepOpen}
        onPrepOpenChange={setDetailsPrepOpen}
      >
        {(stripeBase) =>
          !(isBulkWpUploadRun && !prepSections) &&
          visibleUrls.map((url, localIndex) => {
            const row = overviewRowByUrl.get(normalizePageUrlKey(url));
            if (!row) return null;
            const index = showBulkPagination ? visibleStart + localIndex : localIndex;
            const stripeIndex = stripeBase + localIndex;
            const status =
              urlStatuses[url] ||
              (index < currentIndex
                ? "completed"
                : index === currentIndex
                  ? "optimizing"
                  : "pending");
            const isActive = isOverviewRowBulkActive(row.url, bulkState, !allComplete);
            const isExpanded = expandedUrls.has(url);
            const persistedHarness = urlHarnessSections[url] as BulkHarnessSectionUi[] | undefined;
            const liveHarness =
              isActive && !isParallelHarnessRow
                ? (currentStepProgress?.harnessSections as BulkHarnessSectionUi[] | undefined)
                : undefined;
            const rowGeneratedFiles = generatedFilesForUrl(urlGeneratedFiles, url);
            const rawFiles = mergeGeneratedFilesByName(
              rowGeneratedFiles,
              isActive ? siteProgress?.generatedFiles ?? [] : [],
            );
            const { otherFiles } = partitionPeerDetailFiles({ peers: [], files: rawFiles });
            const isFileSlotRun = isAiseoFileSlotRunKind(bulkState?.runKind);
            const displayFiles = sortFilesForDisplay(
              isFileSlotRun
                ? filterAiseoRowDisplayFiles(bulkState!.runKind, otherFiles)
                : otherFiles,
            );
            const batchPipelineTitles = bulkState
              ? resolveOverviewBulkPipelineTitles(bulkState.runKind, bulkState)
              : undefined;
            const rowPipelineTitles = isFileSlotRun
              ? []
              : resolveBulkRowPipelineTitles(
                  bulkState?.runKind,
                  persistedHarness,
                  displayFiles,
                  batchPipelineTitles,
                  bulkState ?? undefined,
                );
            const rowHarnessSectionsList = isFileSlotRun
              ? buildAiseoRowDisplaySections(bulkState!.runKind, persistedHarness, displayFiles)
              : resolveDetailsPipelineSections(
                  persistedHarness,
                  liveHarness,
                  rowPipelineTitles,
                  displayFiles,
                );
            const rowKeyword = row.focusKeyword?.trim() || bulkRowLinkLabel(url, urlKeywords[url]);
            const serpBriefDownload = resolveSerpBriefDownloadable(
              rowKeyword,
              displayFiles,
              row.seoResearch,
            );
            const toggleRow = () => {
              setRowExpanded(url, !isExpanded);
            };
            const panelId = `bulk-details-row-${index}`;
            const activeStatus = isActive && detailsLiveMessage ? detailsLiveMessage : "";
            const isSimpleAiseoHarness = isAiseoSimpleHarnessRunKind(bulkState?.runKind);
            const fileSlotProgress =
              isFileSlotRun && isActive && (persistedHarness?.length ?? 0) > 0
                ? `${persistedHarness!.filter((section) => section.status === "done").length}/${persistedHarness!.length}`
                : "";
            const activeProgressLabel =
              fileSlotProgress ||
              (isActive && totalCount > 0 ? `${index + 1}/${totalCount}` : "");
            const showGeneratedFiles = isFileSlotRun
              ? isExpanded || isActive
              : isSimpleAiseoHarness
                ? isExpanded
                : isExpanded || Boolean(activeStatus) || Boolean(activeProgressLabel);

            if (isExpanded || (isActive && (!isSimpleAiseoHarness || isFileSlotRun))) {
              return (
                <div key={url} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                  <div className={contentOptimizerRowStripeClass(stripeIndex, { isActiveOptimize: isActive })}>
                    <MetaOptimizerPageRowCompact
                      row={row}
                      wpTitlesByUrl={wpTitlesByUrl}
                      isExpanded={isExpanded}
                      embedded
                      stripeIndex={stripeIndex}
                      isActiveOptimize={isActive}
                      panelId={panelId}
                      onToggle={toggleRow}
                      editableDate={drawerDateEditable}
                      onDateModifierChange={
                        drawerDateEditable
                          ? (dateIso) => onRowDateModifierChange!(url, dateIso)
                          : undefined
                      }
                      onDateModifierCommit={
                        drawerDateEditable
                          ? () => onRowDateModifierCommit?.(url)
                          : undefined
                      }
                    />
                    {showGeneratedFiles ? (
                      <BulkDetailsTileSections
                        harnessSections={rowHarnessSectionsList}
                        pipelineSectionTitles={rowPipelineTitles}
                        files={displayFiles}
                        onDownloadFile={downloadFile}
                        onDownloadAll={downloadAllForUrl}
                        stripeBaseIndex={stripeIndex + 1}
                        serpBriefDownload={serpBriefDownload}
                        statusMessage={activeStatus || undefined}
                        progressLabel={activeProgressLabel || undefined}
                        defaultFilesOpen={isFileSlotRun && isActive}
                        filesOnly={isFileSlotRun}
                        fileSlotRunKind={isFileSlotRun ? bulkState!.runKind : undefined}
                      />
                    ) : null}
                  </div>
                </div>
              );
            }

            return (
              <div key={url} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS}>
                <MetaOptimizerPageRowCompact
                  row={row}
                  wpTitlesByUrl={wpTitlesByUrl}
                  isExpanded={false}
                  stripeIndex={stripeIndex}
                  isActiveOptimize={isActive}
                  panelId={panelId}
                  onToggle={toggleRow}
                  editableDate={drawerDateEditable}
                  onDateModifierChange={
                    drawerDateEditable
                      ? (dateIso) => onRowDateModifierChange!(url, dateIso)
                      : undefined
                  }
                  onDateModifierCommit={
                    drawerDateEditable ? () => onRowDateModifierCommit?.(url) : undefined
                  }
                />
              </div>
            );
          })
        }
      </BulkDetailsDrawerStack>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-transparent shadow-none",
        isDetailsOnly ? "min-h-0" : "min-h-0 flex-1 overflow-hidden",
        variant === "modal" && "max-h-[90vh]",
        variant === "page" &&
          !isDetailsOnly &&
          (!isHarnessParallelRun || harnessDetailsOpen) &&
          "max-h-[min(85vh,1200px)]",
      )}
    >
        {variant === "modal" ? (
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4">
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            Bulk optimization
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {totalCount > 0 ? (
              <>Targets: {totalCount} · Done: {completedCount}
                {skippedCount > 0 ? ` · Skipped: ${skippedCount}` : ""}
                {errorCount > 0 ? ` · Errors: ${errorCount}` : ""}
                {currentIndex < totalCount && !allComplete ? " · In progress" : ""}
              </>
            ) : (
              <>No active operations</>
            )}
          </DialogDescription>
        </DialogHeader>
        ) : !isDetailsOnly ? (
        <div className="shrink-0 px-4 pb-2 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {pageTitle || "Content Optimizer"}
            </h2>
            {isHarnessParallelRun && variant === "page" ? (
              <Button
                variant="quiet"
                type="button"
                onClick={() => setHarnessDetailsOpen((open) => !open)}
                aria-expanded={harnessDetailsOpen}
              >
                <ChevronDown
                  className={cn(
                    "mr-1 h-4 w-4 transition-transform",
                    harnessDetailsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
                {harnessDetailsOpen ? "Hide details" : "Show details"}
              </Button>
            ) : null}
          </div>
          {!isHarnessParallelRun ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {pageSubtitle ||
                (totalCount > 0
                  ? `Targets: ${totalCount} · Done: ${completedCount}${skippedCount > 0 ? ` · Skipped: ${skippedCount}` : ""}${errorCount > 0 ? ` · Errors: ${errorCount}` : ""}`
                  : "Bulk run")}
            </p>
          ) : null}
        </div>
        ) : null}

        <div className={cn("flex min-h-0 flex-1 flex-col", isDetailsOnly ? "overflow-hidden" : "space-y-4 px-4 pb-4")}>
        {/* Harness runs: pages-done ticker (matches workspace MetaBulkMicroProgress bar) */}
        {totalCount > 0 && isHarnessParallelRun && !isDetailsOnly && (
          <div className="shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-base font-medium leading-tight text-foreground">
                {!allComplete ? (
                  null
                ) : null}
                <span>Pages</span>
              </span>
              <span
                className="shrink-0 text-base tabular-nums text-muted-foreground"
                aria-label={`${harnessPagesDone} of ${totalCount} pages`}
              >
                {harnessPagesDone} / {totalCount}
              </span>
            </div>
            <Progress
              className="h-1.5"
              value={harnessPagesPct}
              aria-label={`${harnessPagesDone} of ${totalCount} pages`}
            />
            {variant === "page" && !harnessDetailsOpen ? (
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  onClick={() => onRequestClose({ abortingRun: false })}
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Close
                </Button>
                {isBulkAiAllMetaRun && allComplete && completedCount > 0 && onUploadToWordPress ? (
                  <Button
                    variant="run"
                    type="button"
                    onClick={() => onUploadToWordPress()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload to WordPress
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {(isHarnessParallelRun && variant === "page" ? harnessDetailsOpen : true) ? (
        <>
        {(() => {
          const { planFile, combinedCsvFile, summaryFile } = partitionPeerDetailFiles({
            peers: [],
            files: batchPeerLibraryFiles,
          });
          if (!planFile && !combinedCsvFile && !summaryFile) return null;
          return (
            <div className="space-y-0 border-0 bg-transparent px-2.5 pb-2 pt-0 sm:px-3">
              <div className="flex min-h-9 w-full items-center justify-between gap-2 border-0 px-2.5 py-1.5 text-white sm:px-3">
                <span className="text-white">
                  {summaryFile && !planFile && !combinedCsvFile
                    ? "Local Image summary"
                    : "City sitemap plan"}
                </span>
              </div>
              <div className="flex min-h-9 w-full items-center justify-between gap-2 border-0 px-2.5 py-1.5 text-white sm:px-3">
                {planFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(planFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Plan
                  </Button>
                ) : null}
                {combinedCsvFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(combinedCsvFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </Button>
                ) : null}
                {summaryFile ? (
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => downloadFile(summaryFile)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Summary
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })()}
        {showWpUploadBatchHarness && wpUploadBatchHarnessSections ? (
          <BulkHarnessSectionsPanel
            harnessSections={wpUploadBatchHarnessSections}
            harnessPlannedSectionCount={wpUploadBatchHarnessSections.length}
            currentRow={harnessPagesDone}
            totalRows={totalCount}
            isProcessing={!allComplete}
            hideHeader={false}
            activeIndicator="spinner"
            variant="default"
            hideProgressMicroLines={false}
          />
        ) : null}
        {totalCount > 0 && isInitialLoading && !isDetailsOnly && (
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between text-base font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Loading sitemap &amp; site data</span>
              {!isDetailsOnly ? (
                null
              ) : null}
            </div>
            <BulkProgressBar indeterminate />
            <div className="break-words text-xs text-muted-foreground" title={initialLoadingMessage}>
              {initialLoadingMessage}
            </div>
          </div>
        )}

        {/* Batch progress (content optimizer only; harness runs use per-URL status column) */}
        {totalCount > 0 && !isHarnessParallelRun && !isDetailsOnly && (
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>Batch progress</span>
              <span className="tabular-nums text-foreground">{overallProgress}%</span>
            </div>
            <BulkProgressBar value={overallProgress} />
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 break-words" title={isInitialLoading || isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun ? initialLoadingMessage : undefined}>
                {isInitialLoading || ((isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun) && !allComplete)
                  ? initialLoadingMessage
                  : `${processedCount} of ${totalCount} targets processed`}
              </span>
              <span className="shrink-0 tabular-nums">
                {isInitialLoading || ((isBulkAiAllMetaRun || isBulkResearchRun || isBulkWpUploadRun) && !allComplete && processedCount === 0)
                  ? `${Object.keys(urlKeywords).length} keywords ready`
                  : (isBulkExtraTextRun || isBulkAiAllMetaRun || isBulkResearchRun || isBulkWpUploadRun) &&
                      !allComplete
                    ? `${completedCount + errorCount} of ${totalCount} done`
                    : `${completedCount} done · ${skippedCount} skipped`}
              </span>
            </div>
          </div>
        )}

        {/* Target list */}
        <section
          aria-label="Bulk targets"
          className={cn(isDetailsOnly ? undefined : "min-h-0 flex-1 overflow-y-auto")}
        >
          {urls.length > 0 && (
            <div className="space-y-2">
              {showBatchPrepHarness && batchPrepHarnessSections ? (
                <div className={cn("px-3 py-2", "rounded-md bg-black/20")}>
                  <BulkHarnessSectionsPanel
                    harnessSections={batchPrepHarnessSections}
                    harnessPlannedSectionCount={batchPrepHarnessSections.length}
                    currentRow={0}
                    totalRows={1}
                    isProcessing={!allComplete}
                    hideHeader={false}
                    activeIndicator="spinner"
                    variant="default"
                    hideProgressMicroLines={false}
                  />
                </div>
              ) : null}
              {showBulkPagination ? (
                <div className="space-y-2">
                  <OverviewGridPagination
                    pageIndex={uiPageIndex}
                    totalCount={totalCount}
                    pageSize={bulkPageSize}
                    onPageChange={setUiPageIndex}
                    className="rounded-none bg-ui-field"
                  />
                  {bulkState?.currentBulkPage && !allComplete ? (
                    <p className="px-1 text-base text-muted-foreground">
                      Processing page {bulkState.currentBulkPage}/{totalBulkPages}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div
                className={cn(
                  "sticky top-0 z-10 rounded-md bg-black/40 px-3 py-2 text-base font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-sm",
                  BULK_ROW_GRID,
                )}
                role="row"
              >
                <div aria-hidden className="w-4" />
                <div className="whitespace-nowrap">Status</div>
                <div className="min-w-0">Keyword</div>
                <div className="text-right">Progress</div>
              </div>

              <ul className="space-y-2" role="list">
                {visibleUrls.map((url, localIndex) => {
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

                  return (
                    <li key={url} className={cn(showActiveRowBorder && !isDetailsOnly && "relative z-10")}>
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={(open) => {
                        setRowExpanded(url, open);
                      }}
                      className={cn(
                        isDetailsOnly
                          ? detailsDrawerRowStripeClass(index, {
                              isActiveOptimize: isDetailsCurrentRow,
                            })
                          : cn(
                              "rounded-md border border-transparent bg-black/20",
                              showActiveRowBorder ? "overflow-visible" : "overflow-hidden",
                            ),
                        showActiveRowBorder && !isDetailsOnly && BULK_ACTIVE_SEMANTIC_BORDER_CLASS,
                        isCompleted && "opacity-95",
                        isSkipped && "bg-semantic-warning/[0.06]",
                        isError && "bg-ui-danger/[0.06]",
                      )}
                    >
                      <CollapsibleTrigger asChild>
                        <RowButton
                          type="button"
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 text-foreground/70 transition-transform",
                              isDetailsOnly && "mt-0.5 text-white/70",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden
                          />
                          {!isDetailsOnly ? (
                            <div className="flex justify-center">
                              {isActive && null}
                              {isWarmingUp && null}
                              {isReady && <CircleDot className="h-4 w-4 text-semantic-analysis-foreground" />}
                              {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              {isSkipped && <MinusCircle className="h-4 w-4 text-semantic-warning-foreground" />}
                              {isError && <AlertCircle className="h-4 w-4 text-ui-danger-hover" />}
                              {isPending && !isWarmingUp && !isReady && (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          ) : null}
                          {isDetailsOnly ? (
                            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                              <div className="min-w-0 flex-1 whitespace-normal text-base [overflow-wrap:anywhere]">
                                {(() => {
                                  const liveHref =
                                    isCompleted && publishedLinksByUrl[url]?.trim()
                                      ? publishedLinksByUrl[url]!.trim()
                                      : url;
                                  return (
                                    <a
                                      href={liveHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "font-normal underline-offset-2 hover:underline",
                                        isDetailsCurrentRow
                                          ? "text-[hsl(var(--semantic-data-foreground))]"
                                          : cn(
                                              "text-foreground",
                                              isCompleted &&
                                                (urlKeywords[url]
                                                  ? "text-primary/90"
                                                  : "text-semantic-warning-foreground/80"),
                                              isSkipped && "text-semantic-warning-foreground",
                                              isError && "text-ui-danger-hover",
                                            ),
                                      )}
                                      title={liveHref}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {bulkRowLinkLabel(url, keyword)}
                                    </a>
                                  );
                                })()}
                                {detailsStepLabel ? (
                                  <span className="text-[hsl(var(--semantic-data-foreground))]">
                                    {" "}
                                    · {detailsStepLabel}
                                  </span>
                                ) : null}
                                {closedOutcomeLabel ? (
                                  <span
                                    className={cn(
                                      "ml-2 font-semibold uppercase tracking-wide",
                                      closedOutcomeLabel === "Found" && "text-primary",
                                      closedOutcomeLabel === "Generated" && "text-primary",
                                      closedOutcomeLabel === "Skipped" && "text-semantic-warning-foreground",
                                      closedOutcomeLabel === "Failed" && "text-ui-danger-hover",
                                      closedOutcomeLabel === "Done" && "text-primary",
                                    )}
                                  >
                                    · {closedOutcomeLabel}
                                  </span>
                                ) : null}
                              </div>
                              {entityLabel ? (
                                <div className="min-w-0 shrink-0 whitespace-normal text-right text-base text-white [overflow-wrap:anywhere]">
                                  Entity · {entityLabel}
                                </div>
                              ) : null}
                              {generatedFilesForUrl(urlGeneratedFiles, url).length > 0 ? (
                                <Button
                                  variant="quiet"
                                  type="button"
                                  title={`Download ${generatedFilesForUrl(urlGeneratedFiles, url).length} file(s)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadAllForUrl(generatedFilesForUrl(urlGeneratedFiles, url));
                                  }}
                                >
                                  <Download className="mr-1 h-3.5 w-3.5" />
                                  {generatedFilesForUrl(urlGeneratedFiles, url).length}
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                          <div className="min-w-0 overflow-visible whitespace-normal text-base [overflow-wrap:anywhere]">
                            {(() => {
                              const liveHref =
                                isCompleted && publishedLinksByUrl[url]?.trim()
                                  ? publishedLinksByUrl[url]!.trim()
                                  : url;
                              return (
                            <a
                              href={liveHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "font-normal text-foreground underline-offset-2 hover:underline",
                                isCompleted &&
                                  (urlKeywords[url] ? "text-primary/90" : "text-semantic-warning-foreground/80"),
                                isSkipped && "text-semantic-warning-foreground",
                                isError && "text-ui-danger-hover",
                              )}
                              title={liveHref}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {bulkRowLinkLabel(url, keyword)}
                            </a>
                              );
                            })()}
                          </div>
                          )}
                          {!isDetailsOnly ? (
                            <div
                              className={cn(
                                "shrink-0 text-right text-base font-semibold uppercase tracking-wide",
                                isActive && "text-foreground",
                                isWarmingUp && "text-semantic-publish-foreground",
                                isReady && "text-semantic-analysis-foreground",
                                isCompleted && "text-primary",
                                isSkipped && "text-semantic-warning-foreground",
                                isError && "text-ui-danger-hover",
                                isPending && !isWarmingUp && !isReady && "text-muted-foreground",
                              )}
                            >
                              {getStatusLabel()}
                            </div>
                          ) : null}
                        </RowButton>
                      </CollapsibleTrigger>

                      {!isDetailsOnly ? (
                      <CollapsibleContent
                        className={cn(
                          "space-y-3 px-3 pb-3",
                          "data-[state=closed]:animate-none",
                        )}
                      >
                        <>
                        {entityLabel ? (
                          <div className="text-base">
                            <span className="text-muted-foreground">Entity · </span>
                            <span className="font-medium text-foreground">{entityLabel}</span>
                          </div>
                        ) : null}

                      {(() => {
                        const gscSnap = gscPreviewByUrl[url];
                        const showGscRow =
                          gscSnap?.queries?.length ||
                          (gscFetching && isActive && gscActiveUrl === url && !gscSnap?.queries?.length);
                        if (!showGscRow) return null;
                        return (
                          <div className="mt-1 rounded-md bg-black/15 px-3 py-2">
                            <GscPerformancePreviewRow
                              snapshot={gscSnap ?? null}
                              loading={
                                Boolean(gscFetching && isActive && gscActiveUrl === url && !gscSnap?.queries?.length)
                              }
                            />
                          </div>
                        );
                      })()}

                      {showHarnessForRow &&
                      showRowHarness &&
                      rowHarnessSectionsList ? (
                        <>
                          {isActive ? (
                            <OptimizationArtifactDownloads
                              files={
                                rowGeneratedFiles.length
                                  ? rowGeneratedFiles
                                  : siteProgress?.generatedFiles ?? []
                              }
                              className="mt-2"
                            />
                          ) : null}
                            <BulkHarnessSectionsPanel
                              harnessSections={rowHarnessSectionsList}
                              harnessPlannedSectionCount={resolveRowHarnessPlannedCount(
                                rowHarnessSectionsList,
                                isParallelHarnessRow,
                                isActive,
                                currentStepProgress?.harnessPlannedSectionCount,
                                persistedHarness?.length ?? 0,
                              )}
                              currentRow={index}
                              totalRows={Math.max(urls.length, 1)}
                              isProcessing={isActive || isWarmingUp}
                              hideHeader={isParallelHarnessRow}
                              activeIndicator="spinner"
                              variant="default"
                              hideSectionDownloads={
                                bulkState?.runKind === "aiInContentImage"
                              }
                            />
                        </>
                          ) : null}

                      {showOptimizationSequence ? (
                        <div className="mt-1 space-y-3">
                          <div className="flex items-center justify-between gap-2 text-base">
                            <div className="min-w-0 flex-1">
                              <span className="text-muted-foreground">Sequence · </span>
                              <span className="font-medium text-primary">
                                {isWarmingUp ? stepLabel(currentStepId) : currentStep}
                              </span>
                            </div>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {isWarmingUp ? bulkState?.currentProgress ?? postProgress : postProgress}%
                            </span>
                          </div>

                          {showOptimizationSequence && currentStepProgress?.message && (
                            <div className="flex items-start gap-1.5">
                              <span
                                className="flex-1 break-words text-sm text-muted-foreground"
                                title={
                                  currentStepProgress.message.length > 120
                                    ? currentStepProgress.message
                                    : undefined
                                }
                              >
                                {currentStepProgress.message.length > 200
                                  ? `${currentStepProgress.message.slice(0, 200).trim()}…`
                                  : currentStepProgress.message}
                              </span>
                              <Button
                                variant="quiet"
                                onClick={() => {
                                  navigator.clipboard.writeText(currentStepProgress.message || "");
                                  notify.success(NOTIFY_COPIED_TO_CLIPBOARD);
                                }}
                                title="Copy"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}

                          {(() => {
                            const files = generatedFilesForUrl(urlGeneratedFiles, url);
                            if (!files || files.length === 0) return null;
                            const sorted = sortFilesForDisplay(files);
                            return (
                              <Collapsible className="space-y-2">
                                <CollapsibleTrigger
                                  className="flex w-full items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-2 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-black/30 [&[data-state=open]>svg]:rotate-180"
                                >
                                  <span>Generated files</span>
                                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2 data-[state=closed]:animate-none">
                                  <Button
                                    type="button"
                                    onClick={() => downloadAllForUrl(sorted)}
                                  >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Download all
                                  </Button>
                                  <div className="max-h-28 overflow-y-auto rounded-md bg-black/20 px-2 py-2">
                                    <div className="space-y-1">
                                      {sorted.map((file, idx) => (
                                        <div
                                          key={file.name + idx}
                                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1"
                                        >
                                          <span
                                            className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-base text-muted-foreground"
                                            title={file.name}
                                          >
                                            {file.name}
                                          </span>
                                          <Button
                                            variant="quiet"
                                            onClick={() => downloadFile(file)}
                                          >
                                            <Download className="mr-1 h-3 w-3" />
                                            File
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            );
                          })()}

                          {!isBulkAiAllMetaRun ? (
                            <TargetingSequence
                              currentStepIndex={currentStepIndex}
                              flat={false}
                            />
                          ) : null}
                        </div>
                      ) : null}

                      {!isDetailsOnly &&
                      isCompleted &&
                        !isActive &&
                        (() => {
                          const files = generatedFilesForUrl(urlGeneratedFiles, url);
                          if (!files || files.length === 0) return null;
                          const sorted = sortFilesForDisplay(files);
                          return (
                            <Collapsible className="space-y-2">
                              <CollapsibleTrigger
                                className="flex w-full items-center justify-between gap-2 rounded-md bg-black/25 px-2 py-2 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-black/35 [&[data-state=open]>svg]:rotate-180"
                              >
                                <span>Generated files</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-2 data-[state=closed]:animate-none">
                                <Button
                                  type="button"
                                  onClick={() => downloadAllForUrl(sorted)}
                                >
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  Download all
                                </Button>
                                <div className="max-h-32 overflow-y-auto rounded-md bg-black/25 px-2 py-2">
                                  <div className="space-y-1">
                                    {sorted.map((file, idx) => (
                                      <div
                                        key={file.name + idx}
                                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-1"
                                      >
                                        <span
                                          className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-base text-muted-foreground"
                                          title={file.name}
                                        >
                                          {file.name}
                                        </span>
                                        <Button
                                          variant="quiet"
                                          onClick={() => downloadFile(file)}
                                        >
                                          <Download className="mr-1 h-3 w-3" />
                                          File
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}

                      {isSkipped && (
                        <div className="rounded-md bg-semantic-warning/[0.07] px-3 py-2">
                          <div className="mb-1 text-base font-semibold uppercase tracking-wide text-semantic-warning-foreground">
                            Skipped
                          </div>
                          <div className="text-base text-semantic-warning-foreground/80">
                            {urlSkipReasons[url]?.trim() ||
                              "Could not derive a keyword from sitemap or page context. Check the URL, title, and entity sitemap settings, then retry."}
                          </div>
                        </div>
                      )}

                      {isError && (
                        <div className="rounded-md bg-ui-danger/[0.07] px-3 py-2">
                          <div className="text-sm text-ui-danger-hover/85">
                            {urlSkipReasons[url]?.trim() || "Processing failed for this target."}
                          </div>
                        </div>
                      )}
                          </>
                      </CollapsibleContent>
                      ) : null}
                    </Collapsible>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className={cn("shrink-0 space-y-3 pt-2", isDetailsOnly ? "pb-2" : "px-4 pb-4")}>
          {/* Completion Message */}
          {allComplete && (
            <div className="flex items-center justify-center gap-2 rounded-md bg-black/20 py-3 text-base font-semibold text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span>All targets finished.</span>
            </div>
          )}

          {/* Footer actions: primary button doubles as Abort/Close controller; Copy/Export when there are completed targets */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!isDetailsOnly
                ? (() => {
                    const isRunningNow = totalCount > 0 && !allComplete;
                    const label = isRunningNow ? "Abort Operation" : "Close";
                    return (
                      <Button
                        onClick={() => {
                          onRequestClose({ abortingRun: isRunningNow });
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        {label}
                      </Button>
                    );
                  })()
                : null}
            </div>
            {completedCount > 0 && (
              <div className="flex items-center gap-2">
                {isBulkAiAllMetaRun && allComplete && onUploadToWordPress ? (
                  <Button
                    variant="run"
                    type="button"
                    onClick={() => onUploadToWordPress()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload to WordPress
                  </Button>
                ) : null}
                {completedCount > 0 ? (
                  <>
                <Button
                  onClick={handleCopyReport}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Copy Report
                </Button>
                <Button
                  onClick={handleDownloadCSV}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
        </>
        ) : null}
        </div>
    </div>
  );
};
