import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import { OVERVIEW_HARNESS_SECTION_TITLES } from "@/lib/overview/overview-blog-overview-harness-sections";
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

export type OverviewHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export function setOverviewHarnessMessage(
  setters: OverviewHarnessSetters,
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
          step: "Overview",
          progress: pct,
          message,
        }),
      },
    };
  });
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "Overview",
      progress: pct,
      message,
    });
    const batch = next[setters.batchKey] as Record<string, unknown> | undefined;
    if (batch && typeof batch === "object") {
      next[setters.batchKey] = {
        ...batch,
        currentStepProgress: {
          ...(batch.currentStepProgress as object),
          step: "Overview",
          progress: pct,
          message,
        },
      };
    }
    return next;
  });
}

export function emitOverviewHarnessPayload(
  url: string,
  setters: OverviewHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const message = `Overview ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
  const progress =
    10 +
    Math.round(
      ((payload.sectionIndex + (payload.phase === "done" ? 1 : 0.5)) /
        Math.max(payload.totalSections, 1)) *
        80,
    );

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? [];
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentUrl: url,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: nextUrlSections,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Overview",
          progress,
          message,
          harnessPlannedSectionCount: OVERVIEW_HARNESS_SECTION_TITLES.length,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: "Overview",
      progress,
      message,
      harnessPlannedSectionCount: OVERVIEW_HARNESS_SECTION_TITLES.length,
    }),
  );
}

export function markOverviewRowOptimizing(
  url: string,
  _index: number,
  setters: OverviewHarnessSetters,
  rowNum: number,
  total: number,
  label: string,
): void {
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
      },
    };
  });
  setOverviewHarnessMessage(
    setters,
    `Overview ${rowNum}/${total}: ${label}`,
    10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85),
  );
}

export function markOverviewRowDone(
  url: string,
  _index: number,
  setters: OverviewHarnessSetters,
  files?: { overviewSectionHtml?: string; postHtml?: string },
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
    const elementFiles = files?.overviewSectionHtml?.trim()
      ? [buildAiseoElementHtmlFile("overview.html", files.overviewSectionHtml)].filter(
          (file): file is NonNullable<typeof file> => file != null,
        )
      : [];
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiOverview",
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

export function markOverviewRowSkipped(url: string, setters: OverviewHarnessSetters): void {
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

export function markOverviewRowError(
  url: string,
  setters: OverviewHarnessSetters,
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
      },
    };
  });
  setOverviewHarnessMessage(setters, message);
}
