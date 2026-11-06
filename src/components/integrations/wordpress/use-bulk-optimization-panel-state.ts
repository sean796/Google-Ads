import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_CSV_DOWNLOADED,
  NOTIFY_REPORT_COPIED_TO_CLIPBOARD,
} from "@/lib/notify-messages";
import {
  stepLabel,
  urlStepIndex,
  type ContentOptimizerStepId,
} from "@/lib/content-optimization/content-optimizer-step-labels";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageCount,
  contentOptimizerBulkPageForIndex,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { isAiseoSimpleHarnessRunKind } from "@/lib/overview/overview-bulk-pipeline-titles";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationPanelProps,
} from "./bulk-optimization-panel-helpers";
import {
  buildBulkRunCsv,
  buildBulkRunReport,
} from "./bulk-optimization-panel-helpers";

export function useBulkOptimizationPanelState({

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
}: BulkOptimizationPanelProps) {
  const isDetailsOnly = displayMode === "details-only";
  const drawerDateEditable = isDetailsOnly && Boolean(onRowDateModifierChange);
  // Extract data safely - handle null gracefully
  const urls = useMemo(() => bulkState?.urls || [], [bulkState?.urls]);
  const currentIndex = bulkState?.currentIndex ?? 0;
  const urlStatuses = useMemo(() => bulkState?.urlStatuses || {}, [bulkState?.urlStatuses]);
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

  const handleCopyReport = () => {
    navigator.clipboard.writeText(
      buildBulkRunReport({
        urls, completedCount, skippedCount, errorCount, optimizedUrls,
        escapedUrls, deflectedUrls, urlKeywords, urlEntities, urlGeneratedFiles,
      }),
    );
    notify.success(NOTIFY_REPORT_COPIED_TO_CLIPBOARD);
  };

  const handleDownloadCSV = () => {
    const csv = buildBulkRunCsv({
      urls, urlStatuses, urlKeywords, urlEntities, urlSerpResearchReady,
    });
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

  return {
    variant, displayMode, bulkState, batchKey, onApproveKeywords, siteProgress,
    onRequestClose, pageTitle, pageSubtitle, gscPreviewByUrl, gscActiveUrl,
    gscFetching, sitemapSource, onUploadToWordPress, publishedLinksByUrl,
    wpTitlesByUrl, overviewRows, onRowDateModifierChange,
    onRowDateModifierCommit, isDetailsOnly, drawerDateEditable, urls,
    currentIndex, urlStatuses, currentStepId, currentStep, currentProgress,
    currentStepProgress, urlKeywords, urlSkipReasons, urlLocalImageOutcomes,
    urlSerpResearchReady, urlEntities, isInContentImageRun, showEntityDetail,
    warmingUpIndex, warmingUpIndex2, researchedUrls, completedCount,
    skippedCount, errorCount, totalCount, processedCount, allComplete,
    bulkPageSize, totalBulkPages, showBulkPagination, activePageFromProgress,
    harnessPagesDone, harnessPagesPct, prepStepLower, isBulkAiAllMetaRun,
    isBulkResearchRun, isBulkWpUploadRun, isBulkExtraTextRun, isBulkAiFaqRun,
    isBulkAiHeadersRun, isHarnessParallelRun, isParallelHarnessRow,
    isInitialLoading, prepProgress, overallProgress, initialLoadingMessage,
    postProgress, currentStepIndex, optimizedUrls, escapedUrls, deflectedUrls,
    isRunning, urlGeneratedFiles, batchPeerLibraryFiles, urlHarnessSections,
    batchPrepHarnessSections, wpUploadBatchHarnessSections, batchInventoryDone,
    showBatchPrepHarness, showWpUploadBatchHarness, detailsLiveMessage,
    expandedUrls, harnessDetailsOpen, setHarnessDetailsOpen, uiPageIndex,
    setUiPageIndex, detailsPrepOpen, setDetailsPrepOpen, setRowExpanded,
    overviewRowByUrl, visibleStart, visibleEnd, visibleUrls,
    detailsCurrentIndex, BULK_ROW_GRID, rowGridClass, handleCopyReport,
    handleDownloadCSV,
  };
}
