import { useEffect, useMemo, useRef } from "react";
import { notifyHeaderError } from "@/lib/app-notifications";
import { useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { isAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import {
  buildSinglePageOptimizationSnapshot,
  pickMetaBulkMicroSnapshot,
} from "@/components/overview/overview-bulk-micro-progress-helpers";
import {
  buildContentOptimizerBulkMicroSnapshot,
  isContentOptimizerBulkRun,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import {
  buildOverviewBulkMicroSnapshot,
  isOverviewBulkDetailsRun,
} from "@/lib/overview/overview-bulk-details-bindings";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { hasActiveBulkActionProgress } from "@/lib/overview/overview-bulk-inline-status";
import { isOverviewBatchAllComplete } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { isOverviewKeywordRunKind } from "@/lib/overview/overview-keywords-harness-run";

export function useOverviewTabShellDerived(ctrl: OverviewTabController) {
  const { scope } = useAgentRunOptimizerScope();
  const combinedError = useMemo(() => {
    const candidates = [
      ctrl.sitemapError,
      ctrl.scrapeError,
      ctrl.aiError,
      ctrl.bindingError,
      ctrl.downloadError,
      ctrl.uploadError,
    ];
    for (const c of candidates) {
      if (!c?.trim()) continue;
      if (c.trim().toLowerCase() === "ok") continue;
      return c;
    }
    return null;
  }, [
    ctrl.sitemapError,
    ctrl.scrapeError,
    ctrl.aiError,
    ctrl.bindingError,
    ctrl.downloadError,
    ctrl.uploadError,
  ]);

  const lastOverviewCombinedErrorNotifyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!combinedError) {
      lastOverviewCombinedErrorNotifyRef.current = null;
      return;
    }
    if (lastOverviewCombinedErrorNotifyRef.current === combinedError) return;
    lastOverviewCombinedErrorNotifyRef.current = combinedError;
    notifyHeaderError("Load failed", combinedError, { duration: 12000 });
  }, [combinedError]);

  const metaOptBulkStripBusy = useMemo(() => {
    return ctrl.overviewSitemapLoadBusy || hasActiveBulkActionProgress(ctrl.bulkActionProgress);
  }, [ctrl.bulkActionProgress, ctrl.overviewSitemapLoadBusy]);

  const defaultBulkBatchKey = ctrl.site ? `${ctrl.site.id}-batch` : "";
  const scopedBatchKey =
    scope && ctrl.site && scope.siteId === ctrl.site.id ? scope.batchKey : defaultBulkBatchKey;
  const siteResearchBatch = defaultBulkBatchKey
    ? ctrl.opt.bulkOptimizationState[defaultBulkBatchKey]
    : undefined;
  const bulkBatchKey =
    siteResearchBatch?.runKind === "research" && siteResearchBatch.urls?.length
      ? defaultBulkBatchKey
      : scopedBatchKey;
  const batchBulkState = bulkBatchKey ? ctrl.opt.bulkOptimizationState[bulkBatchKey] : undefined;
  const siteId = ctrl.site?.id;

  const siteAgentBulkActive = useMemo(() => {
    if (!siteId) return false;
    for (const [key, busy] of Object.entries(ctrl.opt.isOptimizingContent)) {
      if (busy && isAgentRunBatchKey(key)) return true;
    }
    const pending = ctrl.opt.pendingOptimization[siteId] as { batchKey?: string } | undefined;
    if (isAgentRunBatchKey(pending?.batchKey)) return true;
    return false;
  }, [siteId, ctrl.opt.isOptimizingContent, ctrl.opt.pendingOptimization]);

  const mainOptimizerView = !scope || !ctrl.site || scope.siteId !== ctrl.site.id;
  const suppressMainOptAgentBleed = mainOptimizerView && siteAgentBulkActive;

  const isSinglePageOptimizing =
    siteId && !suppressMainOptAgentBleed ? Boolean(ctrl.opt.isOptimizingContent[siteId]) : false;
  const singlePageProgress =
    siteId && !suppressMainOptAgentBleed ? ctrl.opt.optimizationProgress[siteId] : undefined;
  const singlePageUrl =
    siteId && !suppressMainOptAgentBleed
      ? ctrl.opt.pendingOptimization[siteId]?.url ?? ctrl.opt.optimizationProgress[siteId]?.pageUrl
      : undefined;
  const isBatchContentRunning =
    Boolean(
      bulkBatchKey &&
        !suppressMainOptAgentBleed &&
        ctrl.opt.isOptimizingContent[bulkBatchKey] &&
        !isOverviewKeywordRunKind(batchBulkState?.runKind) &&
        !isOverviewBatchAllComplete(batchBulkState),
    );
  const siteProgress = siteId ? ctrl.opt.optimizationProgress[siteId] : undefined;
  const batchProgress = bulkBatchKey ? ctrl.opt.optimizationProgress[bulkBatchKey] : undefined;
  const overviewBulkMicroSnapshot = useMemo(() => {
    if (!batchBulkState || !isOverviewBulkDetailsRun(batchBulkState) || !siteId || !bulkBatchKey) {
      return null;
    }
    return buildOverviewBulkMicroSnapshot({
      siteId,
      batchKey: bulkBatchKey,
      bulkState: batchBulkState,
      batchProgress,
      siteProgress,
      overviewRows: ctrl.rows,
      isOptimizingContent: ctrl.opt.isOptimizingContent,
      optimizationFileManagers: ctrl.opt.optimizationFileManagers,
      siteName: ctrl.site?.name,
    });
  }, [
    batchBulkState,
    siteId,
    bulkBatchKey,
    batchProgress,
    siteProgress,
    ctrl.rows,
    ctrl.opt.isOptimizingContent,
    ctrl.opt.optimizationFileManagers,
    ctrl.site?.name,
  ]);
  const contentOptimizerMicroSnapshot = useMemo(() => {
    if (!batchBulkState || !isContentOptimizerBulkRun(batchBulkState) || !siteId || !bulkBatchKey) {
      return null;
    }
    return buildContentOptimizerBulkMicroSnapshot({
      siteId,
      batchKey: bulkBatchKey,
      bulkState: batchBulkState,
      batchProgress,
      siteProgress,
      overviewRows: ctrl.rows,
      isOptimizingContent: ctrl.opt.isOptimizingContent,
      optimizationFileManagers: ctrl.opt.optimizationFileManagers,
      siteName: ctrl.site?.name,
    });
  }, [
    batchBulkState,
    siteId,
    bulkBatchKey,
    batchProgress,
    siteProgress,
    ctrl.rows,
    ctrl.opt.isOptimizingContent,
    ctrl.opt.optimizationFileManagers,
    ctrl.site?.name,
  ]);
  const bulkMicroSnapshot = useMemo(() => {
    const batchUrlCount = batchBulkState?.urls?.length ?? 0;
    const batchSnapshot = pickMetaBulkMicroSnapshot(
      ctrl.bulkActionProgress,
      batchBulkState,
      isBatchContentRunning,
      ctrl.site?.name,
    );
    const singleSnapshot = buildSinglePageOptimizationSnapshot(singlePageProgress, {
      isOptimizing: isSinglePageOptimizing,
      pageUrl: singlePageUrl,
    });

    if (
      isBatchContentRunning &&
      batchUrlCount > 0 &&
      isOverviewBulkDetailsRun(batchBulkState)
    ) {
      return overviewBulkMicroSnapshot ?? contentOptimizerMicroSnapshot ?? batchSnapshot ?? singleSnapshot;
    }
    if (isSinglePageOptimizing) {
      return singleSnapshot;
    }
    return batchSnapshot;
  }, [
    ctrl.bulkActionProgress,
    batchBulkState,
    isBatchContentRunning,
    ctrl.site?.name,
    isSinglePageOptimizing,
    singlePageProgress,
    singlePageUrl,
    contentOptimizerMicroSnapshot,
    overviewBulkMicroSnapshot,
  ]);
  const bulkWorkspaceBusy = useMemo(() => {
    return (
      hasActiveBulkActionProgress(ctrl.bulkActionProgress) ||
      isBatchContentRunning ||
      Boolean(ctrl.site && ctrl.opt.isOptimizingContent[ctrl.site.id]) ||
      ctrl.bulkSeoCsvExportBusy
    );
  }, [ctrl.bulkActionProgress, ctrl.site, ctrl.opt.isOptimizingContent, isBatchContentRunning, ctrl.bulkSeoCsvExportBusy]);

  return {
    combinedError,
    metaOptBulkStripBusy,
    bulkBatchKey,
    batchBulkState,
    isBatchContentRunning,
    isSinglePageOptimizing,
    bulkMicroSnapshot,
    bulkWorkspaceBusy,
  };
}
