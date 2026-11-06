import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import { harnessStepProgress, mergeOverviewHarnessProgress } from "@/lib/overview/overview-harness-progress";
import {
  appendResearchGeneratedFile,
  buildWaitingResearchHarnessSections,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-research-harness-sections";
import type { ResearchArtifactFile } from "@/lib/overview/overview-research-row";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import {
  harnessTitleIsResearchStep,
  type InitOverviewResearchHarnessParams,
  type ResearchHarnessSetters,
  type SetBulkState,
} from "@/lib/overview/overview-research-harness-shared";

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
