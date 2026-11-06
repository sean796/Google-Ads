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

export type KeywordHarnessSetters = {
  siteId: string;
  batchKey: string;
  runKind: "contentKw" | "entityKw";
  stepLabel: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export function setKeywordHarnessMessage(
  setters: KeywordHarnessSetters,
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
          step: setters.stepLabel,
          progress: pct,
          message,
        }),
      },
    };
  });
}

export function markKeywordRowOptimizing(
  url: string,
  setters: KeywordHarnessSetters,
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
          step: setters.stepLabel,
          progress: pct,
          message: `${setters.stepLabel} ${rowNum}/${total}: ${label}`,
        }),
      },
    };
  });
}

export function markKeywordRowDone(
  url: string,
  setters: KeywordHarnessSetters,
  files: { focusKeyword: string; postHtml?: string },
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
    const elementFile = buildAiseoElementJsonFile("focus-keyword.json", {
      url,
      focusKeyword: files.focusKeyword,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: setters.runKind,
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

export function markKeywordRowError(
  url: string,
  setters: KeywordHarnessSetters,
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
          step: setters.stepLabel,
          message,
        }),
      },
    };
  });
}
