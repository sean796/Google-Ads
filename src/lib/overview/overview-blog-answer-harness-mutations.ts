import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  buildAiseoElementHtmlFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type AnswerHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

const STEP_LABEL = "Answer";

export function setAnswerHarnessMessage(
  setters: AnswerHarnessSetters,
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

export function markAnswerRowOptimizing(
  url: string,
  _index: number,
  setters: AnswerHarnessSetters,
  rowNum: number,
  total: number,
  label: string,
): void {
  const pct = 10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85);
  const message = `${STEP_LABEL} ${rowNum}/${total}: ${label}`;
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
          message,
        }),
      },
    };
  });
}

export function markAnswerRowDone(
  url: string,
  _index: number,
  setters: AnswerHarnessSetters,
  files?: { answerHtml?: string; postHtml?: string },
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
    const elementFiles = files?.answerHtml?.trim()
      ? [buildAiseoElementHtmlFile("answer.html", files.answerHtml)].filter(
          (file): file is NonNullable<typeof file> => file != null,
        )
      : [];
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiAnswer",
      url,
      existingFiles,
      elementFiles,
      postHtml: files?.postHtml,
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

export function markAnswerRowSkipped(url: string, setters: AnswerHarnessSetters): void {
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

export function markAnswerRowError(
  url: string,
  setters: AnswerHarnessSetters,
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
