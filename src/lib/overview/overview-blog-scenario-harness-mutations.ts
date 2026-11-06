import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import {
  buildScenarioJsonGeneratedFile,
  type ScenarioJsonArtifact,
} from "@/lib/overview/overview-blog-scenario-harness-sections";
import { mergeAiseoRowFinishFiles } from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type ScenarioHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

const STEP_LABEL = "Case scenario";

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function computeScenarioBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  let doneRows = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    if (status === "completed" || status === "error") {
      doneRows += 1;
      continue;
    }
    if (countDoneSections(batch.urlHarnessSections?.[url])) doneRows += 1;
  }
  return Math.min(99, Math.round((doneRows / urls.length) * 100));
}

export function setScenarioHarnessMessage(
  setters: ScenarioHarnessSetters,
  message: string,
  progress?: number,
): void {
  const pct = progress ?? 5;
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: STEP_LABEL,
          progress: pct,
          message,
        }),
      },
    };
  });
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: STEP_LABEL,
      progress: pct,
      message,
    });
    const batch = next[setters.batchKey] as Record<string, unknown> | undefined;
    if (batch && typeof batch === "object") {
      next[setters.batchKey] = {
        ...batch,
        currentStepProgress: {
          ...(batch.currentStepProgress as object),
          step: STEP_LABEL,
          progress: pct,
          message,
        },
      };
    }
    return next;
  });
}

export function applyScenarioHarnessPayload(
  url: string,
  setters: ScenarioHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const message =
    payload.phase === "start" ? "Case scenario…" : "Case scenario complete";
  let latestProgress = 5;

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? [];
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlHarnessSections: {
        ...(current.urlHarnessSections || {}),
        [url]: nextUrlSections,
      },
    };
    latestProgress = computeScenarioBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: STEP_LABEL,
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: 1,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: STEP_LABEL,
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: 1,
    }),
  );
}

export function emitScenarioHarnessPayload(
  url: string,
  payload: BulkHarnessSectionPayload,
  setters: ScenarioHarnessSetters,
): void {
  applyScenarioHarnessPayload(url, setters, payload);
}

export function markScenarioRowActive(
  url: string,
  rowIndex: number,
  setters: ScenarioHarnessSetters,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const urls = current.urls ?? [];
    const urlIndex = urls.findIndex((candidate) => candidate.trim() === url.trim());
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
        currentUrl: url,
        currentIndex: urlIndex >= 0 ? urlIndex : rowIndex,
      },
    };
  });
}

export function finishScenarioRowHarness(
  url: string,
  rowIndex: number,
  artifact: ScenarioJsonArtifact,
  setters: ScenarioHarnessSetters,
  cacheWrite: AiseoCacheWriteAccumulator,
  updateRow: (index: number, patch: Partial<OverviewRow>) => void,
  postHtml: string,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  const scenarioFile = buildScenarioJsonGeneratedFile(artifact);

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const files = mergeAiseoRowFinishFiles({
      runKind: "aiScenario",
      url,
      existingFiles,
      elementFiles: scenarioFile ? [scenarioFile] : [],
      postHtml,
    });
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses: {
        ...(current.urlStatuses || {}),
        [url]: "completed",
      },
      urlGeneratedFiles: {
        ...(current.urlGeneratedFiles || {}),
        [storageKey]: files,
      },
    };
    const progress = computeScenarioBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: progress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: STEP_LABEL,
          progress,
          message: "Case scenario complete",
        }),
      },
    };
  });

  if (postHtml.trim()) {
    cacheWrite.push(url, postHtml);
  }
  updateRow(rowIndex, { status: "idle" });
}
