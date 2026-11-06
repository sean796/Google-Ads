import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { reduceHarnessSectionList, type HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import type { AiAllMetaRowPatch } from "@/lib/overview/overview-ai-all-meta-batch-parse";
import {
  buildDoneMetaHarnessSections,
  makeMetaHarnessDonePayloads,
  metaHarnessGeneratedFiles,
  metaHarnessPlannedSectionCount,
  type MetaHarnessPrepSummaries,
} from "@/lib/overview/overview-ai-all-meta-harness-sections";
import { buildAiseoElementJsonFile } from "@/lib/overview/overview-aiseo-row-artifacts";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;

export type MetaHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function computeMetaBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  let slotTotal = 0;
  let doneSlots = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    const sectionCount = batch.urlHarnessSections?.[url]?.length ?? 0;
    const rowSlots = sectionCount > 0 ? sectionCount : 5;
    slotTotal += rowSlots;
    if (status === "completed" || status === "skipped" || status === "error") {
      doneSlots += rowSlots;
      continue;
    }
    doneSlots += countDoneSections(batch.urlHarnessSections?.[url]);
  }
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}

export function setMetaUrlStatus(
  batchKey: string,
  url: string,
  status: BulkOptimizationState["urlStatuses"][string],
  setBulkOptimizationState: SetBulkState,
  skipReason?: string,
): void {
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: status },
        ...(skipReason
          ? {
              urlSkipReasons: {
                ...((current as BulkOptimizationState & { urlSkipReasons?: Record<string, string> })
                  .urlSkipReasons || {}),
                [url]: skipReason,
              },
            }
          : {}),
      },
    };
  });
}

export function applyMetaHarnessPayload(
  url: string,
  setters: MetaHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const { siteId, batchKey, setBulkOptimizationState, setOptimizationProgress } = setters;
  const message = `Meta ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
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
    latestProgress = computeMetaBatchProgress(nextBatch);
    return {
      ...prev,
      [batchKey]: {
        ...nextBatch,
        currentProgress: latestProgress,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Generating meta...",
          progress: latestProgress,
          message,
          harnessPlannedSectionCount: payload.totalSections,
        }),
      },
    };
  });

  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, siteId, {
      step: "Generating meta...",
      progress: latestProgress,
      message,
      harnessPlannedSectionCount: payload.totalSections,
    }),
  );
}

export function emitMetaHarnessPayloads(
  url: string,
  payloads: BulkHarnessSectionPayload[],
  setters: MetaHarnessSetters,
): void {
  for (const payload of payloads) {
    applyMetaHarnessPayload(url, setters, payload);
  }
}

export function finishMetaRowHarness(
  entry: AiAllMetaCatalogRow,
  patch: AiAllMetaRowPatch | null,
  prep: MetaHarnessPrepSummaries,
  setters: MetaHarnessSetters,
  updateRow: (index: number, patch: Partial<OverviewRow>) => void,
  options?: { awaitFaqPairs?: boolean },
): boolean {
  const { batchKey, setBulkOptimizationState } = setters;
  const url = entry.url.trim();
  const awaitFaqPairs = options?.awaitFaqPairs ?? entry.faqMode !== "none";

  if (patch) {
    const metaDonePayloads = makeMetaHarnessDonePayloads(entry.index, entry, patch, prep).filter(
      (p) => p.sectionIndex >= 2,
    );
    emitMetaHarnessPayloads(url, metaDonePayloads, setters);

    const sections = buildDoneMetaHarnessSections(entry, patch, prep);
    const elementFile = buildAiseoElementJsonFile("ai-all-meta.json", {
      url,
      focusKeyword: entry.focusKeyword,
      title: patch.title ?? patch.aiTitle ?? entry.existingTitle,
      metaDescription: patch.metaDescription ?? patch.aiMeta ?? entry.existingMeta,
    });
    const files = [
      ...(elementFile ? [elementFile] : []),
      ...metaHarnessGeneratedFiles(sections, url),
    ];
    const rowPatch: Partial<OverviewRow> = { ...patch };
    delete rowPatch.faq;

    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const nextBatch: BulkOptimizationState = {
        ...current,
        urlStatuses: {
          ...(current.urlStatuses || {}),
          [url]: awaitFaqPairs ? "optimizing" : "completed",
        },
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: sections,
        },
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [url]: files,
        },
      };
      const progress = computeMetaBatchProgress(nextBatch);
      return {
        ...prev,
        [batchKey]: {
          ...nextBatch,
          currentProgress: progress,
          currentStepProgress: harnessStepProgress(current.currentStepProgress, {
            step: "Generating meta...",
            progress,
            message: awaitFaqPairs ? "Meta complete; FAQ pairs…" : `Meta complete for ${url}`,
          }),
        },
      };
    });
    updateRow(entry.index, { status: awaitFaqPairs ? "ai-meta" : "idle", ...rowPatch });
    return true;
  }

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        urlStatuses: {
          ...(current.urlStatuses || {}),
          [url]: "error",
        },
        urlSkipReasons: {
          ...((current as BulkOptimizationState & { urlSkipReasons?: Record<string, string> })
            .urlSkipReasons || {}),
          [url]: "No result from batch agent",
        },
      },
    };
  });
  updateRow(entry.index, { status: "error" });
  return false;
}
