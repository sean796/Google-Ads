import { harnessStepProgress, mergeOverviewHarnessProgress } from "@/lib/overview/overview-harness-progress";
import {
  buildOverviewWordPressUploadFailuresCsv,
  overviewCsvHarnessMarkdown,
  type OverviewWordPressUploadFailureRow,
} from "@/lib/overview/overview-wordpress-export-csv";
import {
  buildDoneWpUploadHarnessSections,
  WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
  type WpUploadHarnessDoneSummary,
} from "@/lib/overview/overview-wp-upload-harness-sections";
import type { BulkOverviewSeoResultRow } from "@/lib/wordpress-api/meta";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildWpUploadBatchPipelineSteps,
  wpUploadBatchStepsAfterProgress,
} from "@/lib/overview/overview-batch-pipeline-progress";
import {
  computeWpUploadBatchProgress,
  type SetIsOptimizing,
  type WpUploadHarnessSetters,
} from "./overview-wp-upload-harness-batch";

export {
  emitWpUploadHarnessSection,
  initOverviewWpUploadHarnessBatchState,
  setWpUploadBatchPrepMessage,
  setWpUploadUrlStatus,
} from "./overview-wp-upload-harness-batch";
export type { WpUploadHarnessSetters } from "./overview-wp-upload-harness-batch";

export function applyWpUploadBatchProgress(
  setters: WpUploadHarnessSetters,
  params: {
    done: number;
    total: number;
    wpBatch: number;
    wpBatchCount: number;
    batchResults: BulkOverviewSeoResultRow[];
    localIndexToUrl: Record<number, string>;
    phase?: "start" | "done";
  },
): void {
  const { batchKey, siteId, setBulkOptimizationState, setOptimizationProgress } = setters;
  const phase = params.phase ?? (params.batchResults.length ? "done" : "start");
  const message =
    phase === "start"
      ? `Uploading WordPress post ${params.wpBatch}/${params.wpBatchCount}…`
      : `WordPress post ${params.wpBatch}/${params.wpBatchCount}`;
  const progressPct =
    params.wpBatchCount > 0
      ? Math.min(
          99,
          Math.round(
            ((phase === "start" ? Math.max(0, params.wpBatch - 1) : params.wpBatch) /
              params.wpBatchCount) *
              100,
          ),
        )
      : 0;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const urlStatuses = { ...(current.urlStatuses || {}) };
    const urlSkipReasons = { ...(current.urlSkipReasons || {}) };
    for (const r of params.batchResults) {
      if (typeof r.index !== "number") continue;
      const url = params.localIndexToUrl[r.index];
      if (!url) continue;
      urlStatuses[url] = r.ok ? "completed" : "error";
      if (!r.ok && r.error) urlSkipReasons[url] = r.error;
    }
    const baseSteps =
      current.batchPipelineSteps ?? buildWpUploadBatchPipelineSteps(params.total);
    const batchPipelineSteps = wpUploadBatchStepsAfterProgress(
      baseSteps,
      params.wpBatch,
      params.wpBatchCount,
      phase,
    );
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses,
        urlSkipReasons,
        batchPipelineSteps,
        currentProgress: progressPct,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Uploading to WordPress",
          progress: progressPct,
          message,
          harnessPlannedSectionCount: params.wpBatchCount,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, {
      step: "Uploading to WordPress",
      progress: progressPct,
      message,
      harnessPlannedSectionCount: params.wpBatchCount,
    }),
  );
}

export function finalizeWpUploadHarnessSections(
  setters: WpUploadHarnessSetters,
  failures: OverviewWordPressUploadFailureRow[],
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const sections = [...(current.wpUploadBatchHarnessSections ?? [])];
    if (sections[0]) {
      sections[0] = { ...sections[0], status: "done" };
    }
    if (failures.length > 0) {
      const failuresCsv = buildOverviewWordPressUploadFailuresCsv(failures);
      sections.push({
        sectionIndex: sections.length,
        title: "Upload failures",
        status: "done",
        markdown: overviewCsvHarnessMarkdown(failuresCsv),
      });
    }
    return {
      ...prev,
      [batchKey]: {
        ...current,
        wpUploadBatchHarnessSections: sections,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          harnessSections: sections,
        }),
      },
    };
  });
}

/** Mark every URL in the batch done in one state update (after a single bulk API call). */
export function finishWpUploadBatchHarness(
  urls: string[],
  successByUrl: Record<string, boolean>,
  errorByUrl: Record<string, string | undefined>,
  setters: WpUploadHarnessSetters,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const urlStatuses = { ...(current.urlStatuses || {}) };
    const urlSkipReasons = { ...(current.urlSkipReasons || {}) };
    for (const url of urls) {
      const ok = successByUrl[url] === true;
      urlStatuses[url] = ok ? "completed" : "error";
      const reason = errorByUrl[url];
      if (!ok && reason) {
        urlSkipReasons[url] = reason;
      }
    }
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses,
      urlSkipReasons,
      currentProgress: 100,
      currentStepProgress: harnessStepProgress(current.currentStepProgress, {
        step: "Uploading to WordPress",
        progress: 100,
        message: "Upload batch complete",
        harnessPlannedSectionCount: current.batchPipelineSteps?.length ?? 1,
      }),
    };
    return {
      ...prev,
      [batchKey]: nextBatch,
    };
  });
}

export function finishWpUploadRowHarness(
  url: string,
  summaries: WpUploadHarnessDoneSummary | undefined,
  setters: WpUploadHarnessSetters,
  success: boolean,
  generatedFiles?: Array<{ name: string; content: string; mimeType: string }>,
  errorReason?: string,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  const sections = buildDoneWpUploadHarnessSections(summaries);

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses: {
        ...(current.urlStatuses || {}),
        [url]: success ? "completed" : "error",
      },
      ...(errorReason
        ? {
            urlSkipReasons: {
              ...(current.urlSkipReasons || {}),
              [url]: errorReason,
            },
          }
        : {}),
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: sections,
      },
      ...(generatedFiles?.length
        ? {
            urlGeneratedFiles: {
              ...(current.urlGeneratedFiles || {}),
              [url]: generatedFiles,
            },
          }
        : {}),
    };
    const latestProgress = computeWpUploadBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Uploading to WordPress",
          progress: latestProgress,
          message: success ? "Row uploaded" : "Row upload failed",
          harnessPlannedSectionCount: WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });
}

export function finalizeOverviewWpUploadHarnessBatch(
  batchKey: string,
  siteId: string,
  setters: WpUploadHarnessSetters,
  setIsOptimizingContent: SetIsOptimizing,
  summaryMessage: string,
): void {
  const { setBulkOptimizationState, setOptimizationProgress } = setters;
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, {
      step: "Upload complete",
      progress: 100,
      message: summaryMessage,
    }),
  );
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const batchPipelineSteps = (current.batchPipelineSteps ?? []).map((s) => ({
      ...s,
      status: "done" as const,
    }));
    return {
      ...prev,
      [batchKey]: {
        ...current,
        batchPipelineSteps,
        currentStep: "Upload complete",
        currentProgress: 100,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Upload complete",
          progress: 100,
          message: summaryMessage,
          harnessPlannedSectionCount: batchPipelineSteps.length,
        }),
      },
    };
  });
  setOptimizingState(setIsOptimizingContent, batchKey, false);
}
