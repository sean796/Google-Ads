import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  buildOverviewWordPressExportCsv,
  overviewCsvHarnessMarkdown,
} from "@/lib/overview/overview-wordpress-export-csv";
import {
  buildWaitingWpUploadHarnessSections,
  WP_UPLOAD_HARNESS_SECTION_TITLES,
  WP_UPLOAD_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-wp-upload-harness-sections";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildWpUploadBatchPipelineSteps,
  overviewWpApiBatchCount,
  setBatchStepStatus,
} from "@/lib/overview/overview-batch-pipeline-progress";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";

export type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
export type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
export type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type WpUploadHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function computeWpUploadBatchProgress(batch: BulkOptimizationState): number {
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
