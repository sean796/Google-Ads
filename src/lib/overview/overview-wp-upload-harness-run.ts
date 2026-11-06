import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  buildOverviewWordPressExportCsv,
  buildOverviewWordPressUploadFailuresCsv,
  overviewCsvHarnessMarkdown,
  type OverviewWordPressUploadFailureRow,
} from "@/lib/overview/overview-wordpress-export-csv";
import {
  buildDoneWpUploadHarnessSections,
  buildWaitingWpUploadHarnessSections,
  WP_UPLOAD_HARNESS_SECTION_TITLES,
  WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
  type WpUploadHarnessDoneSummary,
} from "@/lib/overview/overview-wp-upload-harness-sections";
import type { BulkOverviewSeoResultRow } from "@/lib/wordpress-api/meta";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildWpUploadBatchPipelineSteps,
  overviewWpApiBatchCount,
  setBatchStepStatus,
  wpUploadBatchStepsAfterProgress,
} from "@/lib/overview/overview-batch-pipeline-progress";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type WpUploadHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

function computeWpUploadBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  if (batch.runKind === "wpUpload" && batch.wpUploadBatchHarnessSections?.length) {
    let done = 0;
    for (const url of urls) {
      const st = batch.urlStatuses?.[url];
      if (st === "completed" || st === "error" || st === "skipped") {
        done += 1;
      }
    }
    return Math.min(99, Math.round((done / urls.length) * 100));
  }
  const slotTotal = urls.length * WP_UPLOAD_HARNESS_TOTAL_SECTIONS;
  let doneSlots = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    if (status === "completed" || status === "skipped" || status === "error") {
      doneSlots += WP_UPLOAD_HARNESS_TOTAL_SECTIONS;
      continue;
    }
    doneSlots += countDoneSections(batch.urlHarnessSections?.[url]);
  }
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}

export function initOverviewWpUploadHarnessBatchState(params: {
  site: WordPressSite;
  rows: OverviewRow[];
  bindings: Record<string, OverviewBinding | undefined>;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    rows,
    bindings,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing WordPress upload…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = rows.map((r) => r.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const kw = row.focusKeyword?.trim();
    if (kw) urlKeywords[url] = kw;
  }

  const uploadCsv = buildOverviewWordPressExportCsv(rows, bindings);
  const wpUploadBatchHarnessSections: HarnessSectionListItem[] = [
    {
      sectionIndex: 0,
      title: "Upload",
      status: "generating",
      markdown: overviewCsvHarnessMarkdown(uploadCsv),
    },
  ];
  const batchPipelineSteps = setBatchStepStatus(
    buildWpUploadBatchPipelineSteps(urls.length),
    0,
    "running",
  );
  const plannedBatchCount = overviewWpApiBatchCount(urls.length);

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Uploading to WordPress",
      progress: 2,
      message: prepMessage,
      harnessSections: wpUploadBatchHarnessSections,
      harnessPlannedSectionCount: plannedBatchCount,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Uploading to WordPress",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "wpUpload",
      wpUploadBatchHarnessSections,
      batchPipelineSteps,
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Uploading to WordPress",
        progress: 2,
        message: prepMessage,
        harnessSections: wpUploadBatchHarnessSections,
        harnessPlannedSectionCount: plannedBatchCount,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function setWpUploadBatchPrepMessage(
  batchKey: string,
  siteId: string,
  message: string,
  setters: WpUploadHarnessSetters,
): void {
  const { setBulkOptimizationState, setOptimizationProgress } = setters;
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, {
      step: "Uploading to WordPress",
      progress: 5,
      message,
    }),
  );
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentStep: "Uploading to WordPress",
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Uploading to WordPress",
          progress: 5,
          message,
        }),
      },
    };
  });
}

function applyHarnessPayloadToUrl(
  url: string,
  batchKey: string,
  setBulkOptimizationState: SetBulkState,
  payload: BulkHarnessSectionPayload,
): BulkOptimizationState | null {
  let nextBatch: BulkOptimizationState | null = null;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? buildWaitingWpUploadHarnessSections();
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    nextBatch = {
      ...current,
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: nextUrlSections,
      },
    };
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: computeWpUploadBatchProgress(nextBatch),
      },
    };
  });
  return nextBatch;
}

export function emitWpUploadHarnessSection(
  url: string,
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  setters: WpUploadHarnessSetters,
  markdownSlice?: string,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const title = WP_UPLOAD_HARNESS_SECTION_TITLES[sectionIndex] ?? `Section ${sectionIndex + 1}`;
  const payload: BulkHarnessSectionPayload = {
    rowIndex: 0,
    sectionIndex,
    totalSections: WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
    title,
    phase,
    markdownSlice,
  };
  const message = `Upload ${sectionIndex + 1}/${WP_UPLOAD_HARNESS_TOTAL_SECTIONS}: ${title}${phase === "start" ? "…" : ""}`;
  const nextBatch = applyHarnessPayloadToUrl(url, batchKey, setBulkOptimizationState, payload);
  const latestProgress = nextBatch ? computeWpUploadBatchProgress(nextBatch) : 5;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Uploading to WordPress",
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: "Uploading to WordPress",
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
    }),
  );
}

export function setWpUploadUrlStatus(
  batchKey: string,
  url: string,
  status: BulkOptimizationState["urlStatuses"][string],
  setBulkOptimizationState: SetBulkState,
): void {
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: status },
      },
    };
  });
}

/** Apply batch progress after one Pulse JSON response (25 posts). */
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
