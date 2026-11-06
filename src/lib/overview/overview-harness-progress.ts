import type { OptimizationProgressState } from "@/hooks/content-optimization/use-optimization-state";
import {
  mergeHarnessProgressSiteAndBatch,
  mergeOptimizationProgress,
  type OptimizationProgressPatch,
} from "@/hooks/content-optimization/optimization-helpers-a";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { OptimizationFile } from "@/lib/optimization-file-manager";

/**
 * Legacy Overview harness progress patch.
 *
 * The external merge helpers document and implement this shape at runtime:
 * callers may pass `{ step, progress, message }` without a Content Optimizer
 * `stepId`/`subProgress`, and the merge inherits those from the previous
 * entry (or keeps the raw step/progress). `OptimizationProgressPatch` as
 * exported outside Overview requires `stepId`/`subProgress`, so this module
 * is the single validated boundary between the legacy Overview patch and
 * that external type.
 */
export type OverviewHarnessProgressPatch = {
  step?: string;
  progress?: number;
  subProgress?: number;
  message?: string;
  error?: string;
  harnessSections?: HarnessSectionListItem[];
  harnessPlannedSectionCount?: number | null;
  generatedFiles?: OptimizationFile[];
  pageUrl?: string;
} & Record<string, unknown>;

export function mergeOverviewHarnessProgress(
  prev: Record<string, unknown>,
  key: string,
  patch: OverviewHarnessProgressPatch,
): Record<string, unknown> {
  return mergeOptimizationProgress(
    prev as Record<string, OptimizationProgressState>,
    key,
    patch as OptimizationProgressPatch,
  );
}

export function mergeOverviewHarnessProgressSiteAndBatch(
  prev: Record<string, unknown>,
  siteId: string,
  patch: OverviewHarnessProgressPatch,
): Record<string, unknown> {
  return mergeHarnessProgressSiteAndBatch(
    prev as Record<string, OptimizationProgressState>,
    siteId,
    patch as OptimizationProgressPatch,
  );
}

/**
 * Build a complete `OptimizationProgressState` for `BulkOptimizationState`
 * from a partial harness update, keeping the previous entry's fields.
 * The external state type requires `stepId`/`subProgress`; Overview harness
 * steps are label-driven, so an absent previous step id keeps the same
 * `"load"` default consumers already fall back to.
 */
export function harnessStepProgress(
  prev: OptimizationProgressState | undefined,
  patch: Partial<OptimizationProgressState>,
): OptimizationProgressState {
  const merged = { ...prev, ...patch };
  const progress = merged.progress ?? 0;
  return {
    ...merged,
    stepId: merged.stepId ?? "load",
    subProgress: merged.subProgress ?? progress / 100,
    step: merged.step ?? "",
    progress,
  };
}
