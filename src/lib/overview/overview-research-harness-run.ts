import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { Dispatch, SetStateAction } from "react";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  appendResearchGeneratedFile,
  buildWaitingResearchHarnessSections,
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
  type ResearchHarnessDoneSummary,
  type ResearchStepArtifact,
  researchBriefGeneratedFile,
  researchStepArtifactFile,
} from "@/lib/overview/overview-research-harness-sections";
import type { ResearchArtifactFile } from "@/lib/overview/overview-research-row";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;
type SetFileManagers = Dispatch<SetStateAction<Record<string, OptimizationFileManager>>>;

export type InitOverviewResearchHarnessParams = {
  site: WordPressSite;
  rows: OverviewRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  setOptimizationFileManagers?: SetFileManagers;
  prepMessage?: string;
};

export type ResearchHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

function computeResearchBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  const slotTotal = urls.length * RESEARCH_HARNESS_TOTAL_SECTIONS;
  let doneSlots = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    if (status === "completed" || status === "skipped") {
      doneSlots += RESEARCH_HARNESS_TOTAL_SECTIONS;
      continue;
    }
    doneSlots += countDoneSections(batch.urlHarnessSections?.[url]);
  }
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}

export function initOverviewResearchHarnessBatchState(
  params: InitOverviewResearchHarnessParams,
): string {
  const {
    site,
    rows,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    setOptimizationFileManagers,
    prepMessage = "Preparing research batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = rows.map((r) => r.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};
  const urlHarnessSections: BulkOptimizationState["urlHarnessSections"] = {};

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const kw = row.focusKeyword?.trim();
    if (kw) urlKeywords[url] = kw;
    urlHarnessSections[url] = buildWaitingResearchHarnessSections() as BulkHarnessSectionUi[];
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizingState(setIsOptimizingContent, site.id, true);
  setOptimizationFileManagers?.((prev) => ({
    ...prev,
    [site.id]: new OptimizationFileManager(),
  }));
  setOptimizationProgress((prev) => {
    const clearedSite = mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      subProgress: 0.02,
      step: "Researching…",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
      generatedFiles: [],
    });
    return mergeOverviewHarnessProgress(clearedSite, batchKey, {
      subProgress: 0.02,
      step: "Researching…",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
      generatedFiles: [],
    });
  });
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Researching…",
      currentProgress: 2,
      currentUrl: urls[0] ?? "",
      urlKeywords,
      runKind: "research",
      urlHarnessSections,
      urlGeneratedFiles: {},
      urlSerpResearchReady: {},
      batchPrepHarnessSections: [],
      harnessStartedAt: Date.now(),
      warmingUpIndex: null,
      warmingUpIndex2: null,
      researchedUrls: [],
      currentStepProgress: harnessStepProgress(undefined, {
        subProgress: 0.02,
        step: "Researching…",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
        generatedFiles: [],
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function setResearchBatchPrepMessage(
  batchKey: string,
  siteId: string,
  message: string,
  setters: ResearchHarnessSetters,
): void {
  const { setBulkOptimizationState, setOptimizationProgress } = setters;
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, siteId, {
      step: "Researching…",
      progress: 2,
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
        currentStep: "Researching…",
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Researching…",
          progress: 2,
          message,
        }),
      },
    };
  });
}

export function setResearchActiveRow(
  batchKey: string,
  url: string,
  setBulkOptimizationState: SetBulkState,
  totalRows?: number,
): void {
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const trimmedUrl = url.trim();
    const batchUrlIndex = (current.urls ?? []).findIndex(
      (candidate) => normalizePageUrlKey(candidate) === normalizePageUrlKey(trimmedUrl),
    );
    const currentIndex = batchUrlIndex >= 0 ? batchUrlIndex : 0;
    const rowNum = currentIndex + 1;
    const total = totalRows ?? current.urls?.length ?? 0;
    const message =
      total > 0 ? `Research row ${rowNum}/${total}…` : "Researching…";
    const existingSections = current.urlHarnessSections?.[trimmedUrl];
    // Stored sections can carry an "error" status at runtime even though
    // HarnessSectionListItem's status union does not declare it.
    const preservedStatuses: readonly string[] = ["generating", "done", "error"];
    const preserveHarness =
      existingSections?.length &&
      existingSections.some(
        (section) =>
          harnessTitleIsResearchStep(section.title) &&
          preservedStatuses.includes(section.status),
      );
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentUrl: trimmedUrl,
        currentIndex,
        urlStatuses: { ...(current.urlStatuses || {}), [trimmedUrl]: "optimizing" },
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [trimmedUrl]: preserveHarness
            ? existingSections
            : buildWaitingResearchHarnessSections(),
        },
        currentStep: "Researching…",
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Researching…",
          message,
          harnessPlannedSectionCount: RESEARCH_HARNESS_TOTAL_SECTIONS,
        }),
      },
    };
  });
}

export function setResearchUrlStatus(
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

function harnessTitleIsResearchStep(
  title: string,
): title is (typeof RESEARCH_HARNESS_SECTION_TITLES)[number] {
  return (RESEARCH_HARNESS_SECTION_TITLES as readonly string[]).includes(title);
}

export function appendResearchRowGeneratedFile(
  url: string,
  setters: ResearchHarnessSetters,
  file: ResearchArtifactFile,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevFiles = current.urlGeneratedFiles?.[url] ?? [];
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [url]: appendResearchGeneratedFile(prevFiles, file),
        },
      },
    };
  });
}

function countResearchPendingRows(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  return urls.filter((url) => {
    const status = batch.urlStatuses?.[url];
    return status !== "completed" && status !== "error" && status !== "skipped";
  }).length;
}

export function researchBatchHasPendingRows(batch: BulkOptimizationState | undefined): boolean {
  if (!batch?.urls?.length) return false;
  return countResearchPendingRows(batch) > 0;
}

function batchUrlIndex(batch: BulkOptimizationState, url: string): number {
  const idx = (batch.urls ?? []).findIndex(
    (candidate) => normalizePageUrlKey(candidate) === normalizePageUrlKey(url),
  );
  return idx >= 0 ? idx : batch.currentIndex ?? 0;
}

function formatResearchHarnessMessage(
  batch: BulkOptimizationState,
  url: string,
  payload: BulkHarnessSectionPayload,
  totalRows?: number,
): string {
  const total = totalRows ?? batch.urls?.length ?? 0;
  const activeIndex = batchUrlIndex(batch, url);
  const rowPrefix = total > 0 ? `Research row ${activeIndex + 1}/${total} · ` : "";
  const step = `Research ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
  return `${rowPrefix}${step}`;
}

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
