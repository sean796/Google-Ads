import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  appendResearchGeneratedFile,
  buildWaitingResearchHarnessSections,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
  type ResearchHarnessDoneSummary,
  type ResearchStepArtifact,
  researchBriefGeneratedFile,
  researchStepArtifactFile,
} from "@/lib/overview/overview-research-harness-sections";
import type { ResearchArtifactFile } from "@/lib/overview/overview-research-row";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { appendResearchRowGeneratedFile } from "@/lib/overview/overview-research-harness-init";
import {
  batchUrlIndex,
  computeResearchBatchProgress,
  formatResearchHarnessMessage,
  harnessTitleIsResearchStep,
  researchBatchHasPendingRows,
  type ResearchHarnessSetters,
  type SetBulkState,
  type SetIsOptimizing,
  type SetOptProgress,
} from "@/lib/overview/overview-research-harness-shared";

export function applyResearchHarnessPayload(
  url: string,
  setters: ResearchHarnessSetters,
  payload: BulkHarnessSectionPayload,
  keyword?: string,
  rowIndex?: number,
  totalRows?: number,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  let latestProgress = 2;
  let message = "";

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url]?.length
      ? current.urlHarnessSections[url]!
      : buildWaitingResearchHarnessSections();
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    let nextFiles = current.urlGeneratedFiles?.[url] ?? [];
    if (payload.phase === "done" && harnessTitleIsResearchStep(payload.title)) {
      const stepArtifact: ResearchStepArtifact | null = researchStepArtifactFile(
        payload.title,
        payload.markdownSlice,
        keyword,
      );
      if (stepArtifact) {
        nextFiles = appendResearchGeneratedFile(nextFiles, stepArtifact);
      }
    }
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: nextUrlSections,
      },
      urlGeneratedFiles: {
        ...(current.urlGeneratedFiles || {}),
        [url]: nextFiles,
      },
    };
    latestProgress = computeResearchBatchProgress(nextBatch);
    message = formatResearchHarnessMessage(nextBatch, url, payload, totalRows);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Researching…",
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: "Researching…",
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
    }),
  );
}

export function failResearchRowHarness(
  url: string,
  errorMessage: string,
  setters: ResearchHarnessSetters,
  rowIndex?: number,
  totalRows?: number,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const trimmedError = errorMessage.trim() || "Research failed";
  let latestProgress = 2;
  let message = trimmedError;
  let batchStep: string = "Research failed";

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url]?.length
      ? current.urlHarnessSections[url]!
      : buildWaitingResearchHarnessSections();
    const nextSections = prevSections.map((section) =>
      section.status === "generating" || section.status === "waiting"
        ? { ...section, status: "done" as const, markdown: trimmedError }
        : section,
    );
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses: {
        ...(current.urlStatuses || {}),
        [url]: "error",
      },
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: nextSections,
      },
    };
    latestProgress = computeResearchBatchProgress(nextBatch);
    const total = totalRows ?? nextBatch.urls?.length ?? 0;
    const activeIndex = batchUrlIndex(nextBatch, url);
    const rowPrefix = total > 0 ? `Research row ${activeIndex + 1}/${total} · ` : "";
    message = `${rowPrefix}${trimmedError}`;
    batchStep = researchBatchHasPendingRows(nextBatch) ? "Researching…" : "Research failed";
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStep: batchStep,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: batchStep,
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: batchStep,
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
    }),
  );
}

export function finishResearchRowHarness(
  url: string,
  rowIndex: number,
  summaries: ResearchHarnessDoneSummary | undefined,
  setters: ResearchHarnessSetters,
  success: boolean,
  briefJson?: string,
  keyword?: string,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const briefFiles = success ? researchBriefGeneratedFile(keyword ?? url, briefJson) : [];
  let latestProgress = 2;
  let message = "";
  let batchStep = "Researching…";

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    let rowFiles = current.urlGeneratedFiles?.[url] ?? [];
    for (const file of briefFiles) {
      rowFiles = appendResearchGeneratedFile(rowFiles, file);
    }
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses: {
        ...(current.urlStatuses || {}),
        [url]: success ? "completed" : "error",
      },
      urlGeneratedFiles: {
        ...(current.urlGeneratedFiles || {}),
        [url]: rowFiles,
      },
    };
    const progress = computeResearchBatchProgress(nextBatch);
    latestProgress = progress;
    const total = nextBatch.urls?.length ?? 0;
    const hasPending = researchBatchHasPendingRows(nextBatch);
    batchStep = hasPending ? "Researching…" : success ? "Batch complete" : "Research failed";
    message = hasPending
      ? total > 0
        ? `Research row ${(nextBatch.currentIndex ?? 0) + 1}/${total}…`
        : "Research row starting…"
      : success
        ? `Research complete for ${url}`
        : `Research failed for ${url}`;
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: progress,
        currentStep: batchStep,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: batchStep,
          progress,
          message,
          harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: batchStep,
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
    }),
  );
}

export function makeResearchHarnessCallback(
  indexToUrl: Map<number, string>,
  indexToKeyword: Map<number, string>,
  totalRows: number,
  setters: ResearchHarnessSetters,
): (index: number, payload: BulkHarnessSectionPayload) => void {
  return (index, payload) => {
    const url = indexToUrl.get(index)?.trim();
    if (!url) return;
    applyResearchHarnessPayload(
      url,
      setters,
      payload,
      indexToKeyword.get(index),
      index,
      totalRows,
    );
  };
}

export function makeResearchArtifactCallback(
  indexToUrl: Map<number, string>,
  setters: ResearchHarnessSetters,
): (index: number, file: ResearchArtifactFile) => void {
  return (index, file) => {
    const url = indexToUrl.get(index)?.trim();
    if (!url) return;
    appendResearchRowGeneratedFile(url, setters, file);
  };
}

export function finalizeOverviewResearchHarnessBatch(
  batchKey: string,
  siteId: string,
  applied: number,
  total: number,
  setBulkOptimizationState: SetBulkState,
  setOptimizationProgress: SetOptProgress,
  setIsOptimizingContent: SetIsOptimizing,
): void {
  const message = `Research finished: ${applied}/${total} updated`;
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, {
      step: "Batch complete",
      progress: 100,
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
        currentStep: "Batch complete",
        currentProgress: 100,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Batch complete",
          progress: 100,
          message,
        }),
      },
    };
  });
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizingState(setIsOptimizingContent, siteId, false);
}
