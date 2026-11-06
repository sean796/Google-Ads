import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-research-harness-sections";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";

export type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
export type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
export type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;
export type SetFileManagers = Dispatch<SetStateAction<Record<string, OptimizationFileManager>>>;

export type InitOverviewResearchHarnessParams = {
  site: WordPressSite;
  rows: OverviewRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  setOptimizationFileManagers?: SetFileManagers;
  prepMessage?: string;
};

export type ResearchHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export function countDoneSections(sections: HarnessSectionListItem[] | undefined): number {
  return (sections ?? []).filter((s) => s.status === "done").length;
}

export function computeResearchBatchProgress(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  if (!urls.length) return 0;
  const slotTotal = urls.length * RESEARCH_HARNESS_TOTAL_SECTIONS;
  let doneSlots = 0;
  for (const url of urls) {
    const status = batch.urlStatuses?.[url];
    if (status === "completed" || status === "skipped") {
      doneSlots += RESEARCH_HARNESS_TOTAL_SECTIONS;
      continue;
    }
    doneSlots += countDoneSections(batch.urlHarnessSections?.[url]);
  }
  return Math.min(99, Math.round((doneSlots / Math.max(slotTotal, 1)) * 100));
}


export function harnessTitleIsResearchStep(
  title: string,
): title is (typeof RESEARCH_HARNESS_SECTION_TITLES)[number] {
  return (RESEARCH_HARNESS_SECTION_TITLES as readonly string[]).includes(title);
}

export function countResearchPendingRows(batch: BulkOptimizationState): number {
  const urls = batch.urls ?? [];
  return urls.filter((url) => {
    const status = batch.urlStatuses?.[url];
    return status !== "completed" && status !== "error" && status !== "skipped";
  }).length;
}

export function researchBatchHasPendingRows(batch: BulkOptimizationState | undefined): boolean {
  if (!batch?.urls?.length) return false;
  return countResearchPendingRows(batch) > 0;
}

export function batchUrlIndex(batch: BulkOptimizationState, url: string): number {
  const idx = (batch.urls ?? []).findIndex(
    (candidate) => normalizePageUrlKey(candidate) === normalizePageUrlKey(url),
  );
  return idx >= 0 ? idx : batch.currentIndex ?? 0;
}

export function formatResearchHarnessMessage(
  batch: BulkOptimizationState,
  url: string,
  payload: BulkHarnessSectionPayload,
  totalRows?: number,
): string {
  const total = totalRows ?? batch.urls?.length ?? 0;
  const activeIndex = batchUrlIndex(batch, url);
  const rowPrefix = total > 0 ? `Research row ${activeIndex + 1}/${total} · ` : "";
  const step = `Research ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
  return `${rowPrefix}${step}`;
}
