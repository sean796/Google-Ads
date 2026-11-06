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

export type MetaHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

const STEP_LABEL = "AI meta";

export function setMetaHarnessMessage(
  setters: MetaHarnessSetters,
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

export function markMetaRowOptimizing(
  url: string,
  setters: MetaHarnessSetters,
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

export function markMetaRowDone(
  url: string,
  setters: MetaHarnessSetters,
  files: { metaDescription: string; aiMeta: string; postHtml?: string },
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
    const elementFile = buildAiseoElementJsonFile("ai-meta.json", {
      url,
      metaDescription: files.metaDescription,
      aiMeta: files.aiMeta,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiMeta",
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

export function markMetaRowSkipped(url: string, setters: MetaHarnessSetters): void {
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

export function markMetaRowError(
  url: string,
  setters: MetaHarnessSetters,
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
