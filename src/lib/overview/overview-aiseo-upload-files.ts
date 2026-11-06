import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import {
  filterAiseoRowDisplayFiles,
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import type { OverviewAiseoGeneratedFile } from "@/lib/overview/overview-aiseo-after-upload-types";

function mergeAiseoUploadRowFiles(
  current: BulkOptimizationState,
  url: string,
  files: OverviewAiseoGeneratedFile[],
): OverviewAiseoGeneratedFile[] {
  const merged = mergeGeneratedFilesByName(generatedFilesForUrl(current.urlGeneratedFiles, url), files);
  if (isAiseoFileSlotRunKind(current.runKind)) {
    return filterAiseoRowDisplayFiles(current.runKind, merged);
  }
  return merged;
}

export function attachAiseoUploadGeneratedFiles(
  batchKey: string,
  setBulkOptimizationState: Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>,
  url: string,
  files: OverviewAiseoGeneratedFile[],
  uploadOk: boolean,
): void {
  if (!url || !files.length) return;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    const fileKey = storageKeyForUrlGeneratedFiles(current?.urlGeneratedFiles, url, current?.urls);
    const rowFiles = current
      ? mergeAiseoUploadRowFiles(current, url, files)
      : mergeGeneratedFilesByName([], files);

    if (!current) {
      return {
        ...prev,
        [batchKey]: {
          urls: [],
          currentIndex: 0,
          urlStatuses: {},
          currentStep: "",
          runKind: "wpUpload",
          urlGeneratedFiles: {
            [fileKey]: rowFiles,
          },
          currentStepProgress: harnessStepProgress(undefined, {
            step: "Upload to WordPress",
            message: uploadOk ? `Uploaded ${url}` : `Upload failed: ${url}`,
          }),
        },
      };
    }

    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: {
          ...(current.urlStatuses || {}),
          [url]: uploadOk ? "completed" : "error",
        },
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [fileKey]: rowFiles,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Upload to WordPress",
          message: uploadOk ? `Uploaded ${url}` : `Upload failed: ${url}`,
        }),
      },
    };
  });
}
