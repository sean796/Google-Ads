import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import { type BlogLinksRowPatch } from "@/lib/overview/overview-blog-links-run";
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

export type LinksHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function setLinksHarnessMessage(
  setters: LinksHarnessSetters,
  message: string,
  progress?: number,
): void {
  const pct = progress ?? undefined;
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "Links",
      progress: pct ?? 5,
      message,
    });
    const batch = next[setters.batchKey] as Record<string, unknown> | undefined;
    if (batch && typeof batch === "object") {
      next[setters.batchKey] = {
        ...batch,
        currentStepProgress: {
          ...(batch.currentStepProgress as object),
          step: "Links",
          progress: pct ?? 5,
          message,
        },
      };
    }
    return next;
  });
}

export function computeLinksBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  let slotTotal = 0;
  let doneSlots = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    const sectionCount = batch.urlHarnessSections?.[url]?.length ?? 0;
    const rowSlots = sectionCount > 0 ? sectionCount : 1;
    slotTotal += rowSlots;
    if (status === "completed" || status === "skipped" || status === "error") {
      doneSlots += rowSlots;
      continue;
    }
    doneSlots += countDoneSections(batch.urlHarnessSections?.[url]);
  }
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}

export function emitLinksHarnessStreamMarkdown(
  url: string,
  setters: LinksHarnessSetters,
  sectionIndex: number,
  title: string,
  markdown: string,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? [];
    const next = [...prevSections];
    while (next.length <= sectionIndex) {
      next.push({ sectionIndex: next.length, title: "", status: "waiting" });
    }
    next[sectionIndex] = {
      sectionIndex,
      title,
      status: "generating",
      markdown,
    };
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: next,
        },
        currentUrl: url,
      },
    };
  });
}

export function emitLinksHarnessPayload(
  url: string,
  setters: LinksHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const message = `Links ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
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
    latestProgress = computeLinksBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Links",
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: payload.totalSections,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: "Links",
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: payload.totalSections,
    }),
  );
}

export function finishLinksRowHarness(
  url: string,
  _rowIndex: number,
  patch: BlogLinksRowPatch,
  setters: LinksHarnessSetters,
  cacheWrite: AiseoCacheWriteAccumulator,
): void {
  const { batchKey, setBulkOptimizationState } = setters;

  cacheWrite.push(url, patch.postContentOptimized);

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    let planPayload: unknown = patch.blogLinksPlanJson;
    try {
      planPayload = JSON.parse(patch.blogLinksPlanJson);
    } catch {
      planPayload = patch.blogLinksPlanJson;
    }
    const elementFile = buildAiseoElementJsonFile("links-plan.json", planPayload);
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiLinks",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml: patch.postContentOptimized,
    });
    const nextBatch: BulkOptimizationState = {
      ...current,
      urlStatuses: {
        ...(current.urlStatuses || {}),
        [url]: "completed",
      },
      urlGeneratedFiles: {
        ...(current.urlGeneratedFiles || {}),
        [storageKey]: mergedFiles,
      },
    };
    const progress = computeLinksBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: progress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Links",
          progress,
          message: "Links complete",
        }),
      },
    };
  });
}

export function markLinksRowSkipped(
  url: string,
  rowIndex: number,
  setters: LinksHarnessSetters,
  updateRow: (index: number, patch: Partial<OverviewRow>) => void,
  reason: string,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "skipped" },
        urlSkipReasons: {
          ...((current as BulkOptimizationState & { urlSkipReasons?: Record<string, string> })
            .urlSkipReasons || {}),
          [url]: reason,
        },
      },
    };
  });
  updateRow(rowIndex, { status: "idle" });
}

export function markLinksRowError(
  url: string,
  _rowIndex: number,
  setters: LinksHarnessSetters,
  error?: string,
): void {
  const { batchKey, setBulkOptimizationState } = setters;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
        urlSkipReasons: {
          ...((current as BulkOptimizationState & { urlSkipReasons?: Record<string, string> })
            .urlSkipReasons || {}),
          [url]: error ?? "Links optimization failed",
        },
      },
    };
  });
}
