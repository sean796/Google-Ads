import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress } from "@/lib/overview/overview-harness-progress";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  OVERVIEW_BULK_PAGE_SIZE,
  overviewBulkPageCount,
} from "@/lib/overview/overview-bulk-page-size";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type OverviewBulkPageStateParams = {
  batchKey: string;
  siteId: string;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress?: SetOptProgress;
  step?: string;
};

/** Progress label for a paginated Overview harness page (1-based page index). */
export function overviewBulkPageProgressLabel(
  start: number,
  end: number,
  page: number,
  pageCount: number,
  total: number,
): string {
  return `Page ${page}/${pageCount}: targets ${start + 1}–${end} of ${total}`;
}

export function setOverviewBulkHarnessPageState(params: OverviewBulkPageStateParams): void {
  const {
    batchKey,
    siteId,
    page,
    pageCount,
    start,
    end,
    total,
    setBulkOptimizationState,
    setOptimizationProgress,
    step = "Processing…",
  } = params;

  const message = overviewBulkPageProgressLabel(start, end, page, pageCount, total);

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
        currentBulkPage: page,
        totalBulkPages: pageCount,
        currentStep: step,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step,
          message,
        }),
      },
    };
  });

  if (setOptimizationProgress) {
    setOptimizationProgress((prev) =>
      mergeOverviewHarnessProgress(prev, siteId, {
        step,
        message,
      }),
    );
  }
}

export function initOverviewBulkHarnessPagination(
  batchKey: string,
  totalCount: number,
  setBulkOptimizationState: SetBulkState,
): void {
  const pageCount = Math.max(1, overviewBulkPageCount(totalCount));
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
        currentBulkPage: 1,
        totalBulkPages: pageCount,
      },
    };
  });
}
