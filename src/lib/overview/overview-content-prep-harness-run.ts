import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  applyBatchPrepHarnessPayload,
  buildBatchPrepHarnessPayload,
  buildWaitingBatchPrepHarnessSections,
  CONTENT_PREP_BATCH_HARNESS_TOTAL_SECTIONS,
} from "./overview-content-prep-harness-sections";
import {
  buildContentOptimizeHarnessPayload,
  buildPredeterminedBlogBodyHarnessTitles,
  buildWaitingContentOptimizeHarnessSections,
  CONTENT_OPTIMIZE_PIPELINE_TOTAL,
  expandContentOptimizeHarnessWithBodySections,
} from "./overview-content-optimize-pipeline";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type ContentPrepHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export { buildWaitingEntitySapBatchPrepHarnessSections } from "./overview-content-prep-harness-sections";

export function buildContentPrepUrlHarnessMap(
  urls: string[],
  articleTitleByUrl?: Record<string, string | undefined>,
  keywordByUrl?: Record<string, string | undefined>,
  entityByUrl?: Record<string, string | undefined>,
  isSap?: boolean,
): Record<string, HarnessSectionListItem[]> {
  const map: Record<string, HarnessSectionListItem[]> = {};
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    const articleTitle = articleTitleByUrl?.[url]?.trim() ?? "";
    map[url] = buildWaitingContentOptimizeHarnessSections(
      buildPredeterminedBlogBodyHarnessTitles(articleTitle, undefined, {
        pageUrl: url,
        keyword: keywordByUrl?.[url],
        entity: entityByUrl?.[url],
        isSap,
      }),
    );
  }
  return map;
}

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function computeContentPrepBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;

  const batchPrepDone = countDoneSections(batch.batchPrepHarnessSections);
  let postDone = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    if (status === "completed") {
      postDone += CONTENT_OPTIMIZE_PIPELINE_TOTAL;
      continue;
    }
    postDone += countDoneSections(batch.urlHarnessSections?.[url]);
  }

  const slotTotal =
    CONTENT_PREP_BATCH_HARNESS_TOTAL_SECTIONS + urls.length * CONTENT_OPTIMIZE_PIPELINE_TOTAL;
  const doneSlots = batchPrepDone + postDone;
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}

export function setContentPrepBatchMessage(
  message: string,
  step: string,
  setters: ContentPrepHarnessSetters,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, { step, progress: 2, message }),
  );
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentStep: step,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step,
          progress: 2,
          message,
          harnessSections: current.batchPrepHarnessSections ?? current.currentStepProgress?.harnessSections,
          harnessPlannedSectionCount: CONTENT_PREP_BATCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });
}

export function markContentPrepBatchHarnessSection(
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  setters: ContentPrepHarnessSetters,
  message?: string,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const payload = buildBatchPrepHarnessPayload(sectionIndex, phase);
  const displayMessage =
    message ??
    `${payload.title}${phase === "start" ? "…" : phase === "done" ? " complete" : ""}`;
  let latestProgress = 2;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevBatchSections =
      current.batchPrepHarnessSections ?? buildWaitingBatchPrepHarnessSections();
    const nextBatchSections = applyBatchPrepHarnessPayload(prevBatchSections, payload);
    const nextBatch: BulkOptimizationState = {
      ...current,
      batchPrepHarnessSections: nextBatchSections,
    };
    latestProgress = computeContentPrepBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          progress: latestProgress,
          message: displayMessage,
          harnessSections: nextBatchSections,
          harnessPlannedSectionCount: CONTENT_PREP_BATCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      progress: latestProgress,
      message: displayMessage,
      harnessPlannedSectionCount: CONTENT_PREP_BATCH_HARNESS_TOTAL_SECTIONS,
    }),
  );
}

function applyContentOptimizeHarnessToUrl(
  url: string,
  payload: BulkHarnessSectionPayload,
  setters: ContentPrepHarnessSetters,
  pipelineTitles?: readonly string[],
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const message = `${payload.title}${payload.phase === "start" ? "…" : payload.phase === "done" ? " complete" : ""}`;
  let latestProgress = 2;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections =
      current.urlHarnessSections?.[url] ?? buildWaitingContentOptimizeHarnessSections();
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: nextUrlSections,
      },
    };
    latestProgress = computeContentPrepBatchProgress(nextBatch);
    const plannedCount = pipelineTitles?.length ?? CONTENT_OPTIMIZE_PIPELINE_TOTAL;
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentUrl: url,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          progress: latestProgress,
          message,
          harnessSections: nextUrlSections,
          harnessPlannedSectionCount: plannedCount,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: pipelineTitles?.length ?? CONTENT_OPTIMIZE_PIPELINE_TOTAL,
    }),
  );
}

export function syncContentOptimizeHarnessBodySections(
  url: string,
  bodyHarnessTitles: readonly string[],
  setters: ContentPrepHarnessSetters,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const expanded = expandContentOptimizeHarnessWithBodySections(
      current.urlHarnessSections?.[url],
      bodyHarnessTitles,
    );
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: expanded,
        },
      },
    };
  });
}

export type ContentPrepHarnessBridge = {
  url: string;
  pipelineTitles: readonly string[];
  setters: ContentPrepHarnessSetters;
  flushGeneratedFiles?: () => void;
};

export function pipelineIndexForHarnessTitle(
  title: string,
  pipelineTitles: readonly string[],
): number {
  const trimmed = title.trim();
  if (!trimmed) return -1;
  return pipelineTitles.indexOf(trimmed);
}

export function markContentPrepHarnessSection(
  url: string,
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  setters: ContentPrepHarnessSetters,
  rowIndex = 0,
  markdownSlice?: string,
  pipelineTitles?: readonly string[],
): void {
  if (sectionIndex < 0) return;
  applyContentOptimizeHarnessToUrl(
    url,
    buildContentOptimizeHarnessPayload(rowIndex, sectionIndex, phase, markdownSlice, pipelineTitles),
    setters,
    pipelineTitles,
  );
}

export function markContentPrepHarnessForUrls(
  urls: string[],
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  setters: ContentPrepHarnessSetters,
): void {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]?.trim();
    if (!url) continue;
    markContentPrepHarnessSection(url, sectionIndex, phase, setters, i);
  }
}
