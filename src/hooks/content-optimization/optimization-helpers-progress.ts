import { OptimizationFileManager, type OptimizationFile } from "@/lib/optimization-file-manager";
import {
  mergeRunProgress,
  computeBatchProgressFromSiteEntry,
  type BulkProgressMeta,
  type ContentOptimizerStepId,
  type RunProgressPatch,
} from "@/lib/content-optimization/content-optimizer-run-progress";
import type {
  GscResultLike,
  OptimizationProgressState,
  PendingOptimization,
} from "@/hooks/content-optimization/use-optimization-state";

export type { GscResultLike };
import { clearSiteCache } from "@/lib/wordpress-site-cache";
import { clearValidationCache } from "@/lib/cached-link-validation";
import { clearRelevanceCache } from "@/lib/content-generation/ai-link-relevance-filter";

// ============================================================================
// State Management Helpers
// ============================================================================

export type OptimizationProgressPatch = RunProgressPatch &
  Partial<{
    generatedFiles: OptimizationFile[];
    bulkMeta?: BulkProgressMeta;
  }> &
  Record<string, unknown>;

export type OptimizationProgressMap = Record<string, OptimizationProgressState>;

export type MapSetter<V> = (
  updater: (prev: Record<string, V>) => Record<string, V>,
) => void;

export type ProgressSetter = MapSetter<OptimizationProgressState>;

function syncSiteProgressToBatchKey(
  prev: OptimizationProgressMap,
  siteId: string,
  siteEntry: OptimizationProgressState,
): OptimizationProgressMap {
  const batchKey = `${siteId}-batch`;
  const batchEntry = prev[batchKey] as
    | (OptimizationProgressState & { bulkMeta?: BulkProgressMeta })
    | undefined;
  if (!batchEntry?.bulkMeta) return prev;
  const batchProgress = computeBatchProgressFromSiteEntry(siteEntry, batchEntry.bulkMeta);
  return mergeRunProgress(prev, batchKey, {
    stepId: siteEntry.stepId,
    subProgress: siteEntry.subProgress ?? 0,
    message: siteEntry.message,
    batchProgress,
    harnessSections: siteEntry.harnessSections,
    harnessPlannedSectionCount: siteEntry.harnessPlannedSectionCount,
    linkCheckResults: siteEntry.linkCheckResults,
  }) as OptimizationProgressMap;
}

function resolveProgressPatch(
  prevEntry: Record<string, unknown>,
  incoming: OptimizationProgressPatch,
): { stepId?: ContentOptimizerStepId; subProgress?: number } {
  const stepId = (incoming.stepId ?? prevEntry.stepId) as ContentOptimizerStepId | undefined;
  let subProgress = incoming.subProgress ?? (prevEntry.subProgress as number | undefined);
  if (subProgress == null && stepId != null && typeof incoming.progress === "number") {
    subProgress = Math.min(1, Math.max(0, incoming.progress / 100));
  }
  return { stepId, subProgress };
}

function attachGeneratedFiles(
  prevEntry: Record<string, unknown>,
  nextEntry: Record<string, unknown>,
  incoming: OptimizationProgressPatch,
): void {
  if (incoming.generatedFiles == null) {
    if (prevEntry.generatedFiles != null) nextEntry.generatedFiles = prevEntry.generatedFiles;
    return;
  }
  if (incoming.generatedFiles.length === 0) {
    nextEntry.generatedFiles = [];
    return;
  }
  const map = new Map<string, OptimizationFile>();
  for (const f of (prevEntry.generatedFiles as OptimizationFile[] | undefined) ?? []) {
    if (f?.name) map.set(f.name, f);
  }
  for (const f of incoming.generatedFiles) {
    if (f?.name) map.set(f.name, f);
  }
  nextEntry.generatedFiles = [...map.values()];
}

/**
 * Merges a progress update for one key (stepId + subProgress → monotonic progress).
 * Legacy callers may pass `{ step, progress, message }` only; inherits stepId/subProgress from prev when present.
 */
export function mergeOptimizationProgress(
  prev: OptimizationProgressMap,
  key: string,
  incoming: OptimizationProgressPatch,
): OptimizationProgressMap {
  const prevEntry: Partial<OptimizationProgressState> = prev[key] ?? {};
  const { stepId, subProgress } = resolveProgressPatch(
    prevEntry as Record<string, unknown>,
    incoming,
  );

  if (stepId != null && subProgress != null) {
    const merged = mergeRunProgress(prev, key, {
      ...incoming,
      stepId,
      subProgress,
    });
    const nextEntry = merged[key]!;
    attachGeneratedFiles(
      prevEntry as Record<string, unknown>,
      nextEntry as Record<string, unknown>,
      incoming,
    );
    return merged as OptimizationProgressMap;
  }

  // Legacy overview / prep harness: raw step + progress without stepId contract
  const siteNext: Record<string, unknown> = { ...prevEntry, ...incoming };
  if (typeof incoming.progress === "number") {
    const prevProgress = typeof prevEntry.progress === "number" ? prevEntry.progress : 0;
    siteNext.progress = Math.max(prevProgress, incoming.progress);
  }
  return { ...prev, [key]: siteNext as unknown as OptimizationProgressState };
}

/** Attach latest fileManager snapshot so download buttons update during a run (metadata only). */
export function progressWithGeneratedFiles(
  patch: OptimizationProgressPatch,
  fileManager: OptimizationFileManager,
): OptimizationProgressPatch {
  return {
    ...patch,
    filesRevision: Date.now(),
    generatedFileNames: fileManager.getFiles().map((f) => f.name),
  };
}

/** Apply a progress patch via setState (for nested callbacks from blueprint / keyword research). */
export function patchOptimizationProgress(
  setProgress: ProgressSetter,
  key: string,
  incoming: Partial<OptimizationProgressPatch> & Record<string, unknown>,
) {
  setProgress((prev) =>
    mergeOptimizationProgress(prev, key, incoming as OptimizationProgressPatch),
  );
}

/** Extra text / content harness lives on site.id; bulk UI also reads `${siteId}-batch`. */
export function mergeHarnessProgressSiteAndBatch(
  prev: OptimizationProgressMap,
  siteId: string,
  incoming: OptimizationProgressPatch,
): OptimizationProgressMap {
  const prevEntry: Partial<OptimizationProgressState> = prev[siteId] ?? {};
  const batchKey = `${siteId}-batch`;
  const { stepId, subProgress } = resolveProgressPatch(
    prevEntry as Record<string, unknown>,
    incoming,
  );

  if (stepId != null && subProgress != null) {
    let next = mergeOptimizationProgress(prev, siteId, {
      ...incoming,
      stepId,
      subProgress,
    });
    next = syncSiteProgressToBatchKey(
      next,
      siteId,
      next[siteId] ??
        ({ ...incoming, stepId, subProgress } as unknown as OptimizationProgressState),
    );
    return next;
  }

  // Legacy overview / prep harness: raw step + progress without stepId contract
  const siteNext = { ...prevEntry, ...incoming };
  let next: OptimizationProgressMap = {
    ...prev,
    [siteId]: siteNext as unknown as OptimizationProgressState,
  };
  if (prev[batchKey] != null) {
    const batchPrev: Partial<OptimizationProgressState> = prev[batchKey] ?? {};
    next = {
      ...next,
      [batchKey]: {
        ...batchPrev,
        ...incoming,
        harnessSections: incoming.harnessSections ?? batchPrev.harnessSections,
        harnessPlannedSectionCount:
          incoming.harnessPlannedSectionCount ?? batchPrev.harnessPlannedSectionCount,
        linkCheckResults: incoming.linkCheckResults ?? batchPrev.linkCheckResults,
      } as OptimizationProgressState,
    };
  }
  return next;
}

export function bindRunProgressReporter(
  setProgress: ProgressSetter,
  key: string,
): (
  stepId: ContentOptimizerStepId,
  subProgress: number,
  message?: string,
  extra?: Omit<OptimizationProgressPatch, "stepId" | "subProgress" | "message">,
) => void {
  return (stepId, subProgress, message?, extra?) => {
    updateOptimizationProgress(setProgress, key, stepId, subProgress, message, extra);
  };
}

export function updateOptimizationProgress(
  setProgress: ProgressSetter,
  key: string,
  stepId: ContentOptimizerStepId,
  subProgress: number,
  message?: string,
  extra?: Omit<OptimizationProgressPatch, "stepId" | "subProgress" | "message">,
) {
  setProgress((prev) => {
    let next = mergeOptimizationProgress(prev, key, {
      stepId,
      subProgress,
      message,
      ...extra,
    });
    const siteId = key.endsWith("-batch") ? key.replace(/-batch$/, "") : key;
    const siteEntry = next[siteId];
    if (!key.endsWith("-batch") && siteEntry) {
      next = syncSiteProgressToBatchKey(next, siteId, siteEntry);
    }
    return next;
  });
}

export function setOptimizingState(
  setIsOptimizing: MapSetter<boolean>,
  key: string,
  isOptimizing: boolean
) {
  setIsOptimizing((prev) => ({ ...prev, [key]: isOptimizing }));
}

export function clearOptimizationState(
  setIsOptimizing: MapSetter<boolean>,
  setProgress: ProgressSetter,
  setPending: MapSetter<PendingOptimization>,
  key: string
) {
  setIsOptimizing((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setProgress((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setPending((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimizationFileManager(
  setFileManagers: MapSetter<OptimizationFileManager>,
  key: string
) {
  setFileManagers((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimization(
  setIsOptimizing: MapSetter<boolean>,
  setProgress: ProgressSetter,
  setPending: MapSetter<PendingOptimization>,
  siteId: string
) {
  setIsOptimizing((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setProgress((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setPending((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });

  clearSiteCache(siteId);
  clearValidationCache(siteId);
  clearRelevanceCache(siteId);
  console.log(`[Optimize Content] Cleared site cache for ${siteId} (manual clear)`);
}
