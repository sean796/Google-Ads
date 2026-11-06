import { useMemo } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { buildMultiSiteHeaderMicroSnapshot } from "@/lib/content-optimization/multi-site-header-progress";

type UseMultiSiteBatchProgressArgs = {
  scope: ReturnType<typeof useAgentRunOptimizerScope>["scope"];
  propertySites: WordPressSite[];
  isOptimizingContent: ReturnType<typeof useWordPressOptimization>["isOptimizingContent"];
  optimizeBusySiteId: string | null;
  bulkOptimizationState: ReturnType<typeof useWordPressOptimization>["bulkOptimizationState"];
  pinnedDetailsBatchKey: string | null;
  optimizeQueueBusy: boolean;
  gscPerformancePreview: ReturnType<typeof useWordPressOptimization>["gscPerformancePreview"];
  optimizationProgress: ReturnType<typeof useWordPressOptimization>["optimizationProgress"];
};

export function useMultiSiteBatchProgress(args: UseMultiSiteBatchProgressArgs) {
  const {
    scope,
    propertySites,
    isOptimizingContent,
    optimizeBusySiteId,
    bulkOptimizationState,
    pinnedDetailsBatchKey,
    optimizeQueueBusy,
    gscPerformancePreview,
    optimizationProgress,
  } = args;

  const bulkRunBatchKey = useMemo(() => {
    if (scope?.batchKey) return scope.batchKey;
    for (const s of propertySites) {
      const bk = `${s.id}-batch`;
      if (isOptimizingContent[bk]) return bk;
    }
    for (const key of Object.keys(isOptimizingContent)) {
      if (key.startsWith("agent-run-") && isOptimizingContent[key]) return key;
    }
    if (optimizeBusySiteId) {
      const busyKey = `${optimizeBusySiteId}-batch`;
      if (isOptimizingContent[busyKey] || bulkOptimizationState[busyKey]) return busyKey;
    }
    for (const key of Object.keys(bulkOptimizationState)) {
      if (key.startsWith("agent-run-") && bulkOptimizationState[key]) return key;
    }
    if (pinnedDetailsBatchKey && bulkOptimizationState[pinnedDetailsBatchKey]) {
      return pinnedDetailsBatchKey;
    }
    return null;
  }, [
    scope?.batchKey,
    propertySites,
    bulkOptimizationState,
    isOptimizingContent,
    optimizeBusySiteId,
    pinnedDetailsBatchKey,
  ]);

  const batchSiteId = scope?.siteId
    ?? (bulkRunBatchKey?.endsWith("-batch") ? bulkRunBatchKey.replace(/-batch$/, "") : "");
  const batchSite = propertySites.find((s) => s.id === batchSiteId);
  const batchBulkState = bulkRunBatchKey ? bulkOptimizationState[bulkRunBatchKey] : null;
  const batchProgress = bulkRunBatchKey ? optimizationProgress[bulkRunBatchKey] : undefined;
  const isBatchRunning = bulkRunBatchKey ? Boolean(isOptimizingContent[bulkRunBatchKey]) : false;
  const bulkActiveUrlDs =
    batchBulkState?.urls?.length && typeof batchBulkState.currentIndex === "number"
      ? batchBulkState.urls[batchBulkState.currentIndex] ?? null
      : null;
  const gscMap = batchSiteId ? gscPerformancePreview[batchSiteId] || {} : {};
  const gscSnapshotDs = bulkActiveUrlDs ? gscMap[bulkActiveUrlDs] : undefined;
  const rowProgressDs = batchSite ? optimizationProgress[batchSite.id] ?? batchProgress : batchProgress;
  const progressTextDs = `${rowProgressDs?.step || ""} ${rowProgressDs?.message || ""}`.toLowerCase();
  const isBusyDs =
    Boolean(batchSite && isOptimizingContent[batchSite.id]) ||
    Boolean(bulkRunBatchKey && isOptimizingContent[bulkRunBatchKey]);
  const gscPreviewLoadingDs =
    Boolean(isBusyDs) &&
    Boolean(bulkActiveUrlDs) &&
    !gscSnapshotDs?.queries?.length &&
    (progressTextDs.includes("gsc") ||
      progressTextDs.includes("search console") ||
      progressTextDs.includes("page performance"));

  const anyBatchBlocking = Boolean(bulkRunBatchKey && isBatchRunning);
  const actionsBlocked = anyBatchBlocking || optimizeQueueBusy;

  const progressSnapshot = useMemo(
    () =>
      buildMultiSiteHeaderMicroSnapshot({
        optimizeQueueBusy,
        optimizeBusySiteId,
        isBatchRunning,
        batchBulkState,
        batchSiteName: batchSite?.name,
      }),
    [optimizeQueueBusy, optimizeBusySiteId, isBatchRunning, batchBulkState, batchSite?.name],
  );

  return {
    bulkRunBatchKey,
    batchSiteId,
    batchSite,
    batchBulkState,
    batchProgress,
    isBatchRunning,
    bulkActiveUrlDs,
    gscMap,
    gscSnapshotDs,
    rowProgressDs,
    progressTextDs,
    isBusyDs,
    gscPreviewLoadingDs,
    anyBatchBlocking,
    actionsBlocked,
    progressSnapshot,
  };
}
