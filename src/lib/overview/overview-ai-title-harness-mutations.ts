import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildAiseoElementJsonFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type TitleHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

const STEP_LABEL = "AI titles";

export function setTitleHarnessMessage(
  setters: TitleHarnessSetters,
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
}

export function markTitleRowOptimizing(
  url: string,
  setters: TitleHarnessSetters,
  rowNum: number,
  total: number,
  label: string,
): void {
  const pct = 10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85);
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentUrl: url,
        currentIndex: rowNum - 1,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
        currentStepProgress: harnessStepProgress(undefined, {
          step: STEP_LABEL,
          progress: pct,
          message: `${STEP_LABEL} ${rowNum}/${total}: ${label}`,
        }),
      },
    };
  });
}

export function markTitleRowDone(
  url: string,
  setters: TitleHarnessSetters,
  files: { title: string; aiTitle: string; postHtml?: string },
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const elementFile = buildAiseoElementJsonFile("ai-title.json", {
      url,
      title: files.title,
      aiTitle: files.aiTitle,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiTitle",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml: files.postHtml,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "completed" },
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: mergedFiles,
        },
      },
    };
  });
}

export function markTitleRowSkipped(url: string, setters: TitleHarnessSetters): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "skipped" },
      },
    };
  });
}

export function markTitleRowError(
  url: string,
  setters: TitleHarnessSetters,
  message: string,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: STEP_LABEL,
          message,
        }),
      },
    };
  });
}
