import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { resolveHarnessRowHtmlFromSources } from "@/lib/overview/overview-harness-page-catalog";
import { resolveOverviewPlaceEntityForRow } from "@/lib/overview/resolve-overview-place-entity";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  emitScenarioHarnessPayload,
  finishScenarioRowHarness,
  markScenarioRowActive,
  setScenarioHarnessMessage,
  type ScenarioHarnessSetters,
} from "@/lib/overview/overview-blog-scenario-harness-mutations";
import {
  buildScenarioJsonGeneratedFile,
  makeScenarioHarnessDonePayload,
  makeScenarioHarnessStartPayload,
} from "@/lib/overview/overview-blog-scenario-harness-sections";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import { generateAndReplaceScenarioSectionHtml } from "@/lib/overview/overview-blog-scenario-section";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export function initOverviewScenarioHarnessBatchState(params: {
  site: WordPressSite;
  rows: OverviewRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    rows,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing Case scenario batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = rows.map((row) => row.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    const kw = row.focusKeyword?.trim();
    if (kw) urlKeywords[url] = kw;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Case scenario",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: 1,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Case scenario",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiScenario",
      harnessStartedAt: Date.now(),
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Case scenario",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: 1,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function initOverviewScenarioHarnessRowState(params: {
  site: WordPressSite;
  row: OverviewRow;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
}): string {
  const { site, row, setBulkOptimizationState, setOptimizationProgress, setIsOptimizingContent } =
    params;

  const batchKey = `${site.id}-batch`;
  const url = row.url.trim();
  const urlKeywords: Record<string, string> = {};
  const kw = row.focusKeyword?.trim();
  if (kw) urlKeywords[url] = kw;

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Case scenario",
      progress: 5,
      message: "Case scenario…",
      harnessSections: [],
      harnessPlannedSectionCount: 1,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls: [url],
      currentIndex: 0,
      urlStatuses: { [url]: "optimizing" },
      currentStep: "Case scenario",
      currentUrl: url,
      urlKeywords,
      runKind: "aiScenario",
      harnessStartedAt: Date.now(),
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Case scenario",
        progress: 5,
        message: "Case scenario…",
        harnessSections: [],
        harnessPlannedSectionCount: 1,
      }),
    },
  }));

  return batchKey;
}

export function finalizeOverviewScenarioHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "Case scenario batch finished",
    });
    return next;
  });
}

export type RunOverviewScenarioHarnessBatchParams = {
  site: WordPressSite;
  rows: OverviewRow[];
  rowIndices: number[];
  sitemapSource: OverviewSitemapSource;
  apiKey: string;
  model?: string;
  harnessSetters: ScenarioHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => import("@/lib/overview/overview-row-scrape").OverviewInventoryUrlMatch | undefined;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export type RunOverviewScenarioHarnessRowParams = {
  site: WordPressSite;
  row: OverviewRow;
  rowIndex: number;
  sitemapSource: OverviewSitemapSource;
  apiKey: string;
  model?: string;
  harnessSetters: ScenarioHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  getInventoryMatchForUrl: RunOverviewScenarioHarnessBatchParams["getInventoryMatchForUrl"];
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewScenarioHarnessRow(
  params: RunOverviewScenarioHarnessRowParams,
): Promise<void> {
  const {
    site,
    row,
    rowIndex,
    sitemapSource,
    apiKey,
    model,
    harnessSetters,
    cacheWrite,
    updateRow,
    getInventoryMatchForUrl,
    uploadAfterRowWrite,
  } = params;

  const url = row.url.trim();
  const pageKind = sitemapSource === "sap" ? "entity" : "post";
  const html = resolveHarnessRowHtmlFromSources({
    row,
    site,
    sitemapSource,
    getInventoryMatchForUrl,
    index: rowIndex,
  }).trim();

  markScenarioRowActive(url, rowIndex, harnessSetters);
  emitScenarioHarnessPayload(url, makeScenarioHarnessStartPayload(rowIndex), harnessSetters);

  const entity =
    sitemapSource === "sap"
      ? await resolveOverviewPlaceEntityForRow({ row, site, sitemapSource })
      : undefined;

  const result = await generateAndReplaceScenarioSectionHtml({
    sourceHtml: html,
    articleTitle: (row.title || "").trim(),
    focusKeyword: (row.focusKeyword || "").trim(),
    pageUrl: url,
    site,
    entity,
    pageKind,
    seoResearchBrief: row.seoResearch?.trim() || undefined,
    apiKey,
    model,
  });

  emitScenarioHarnessPayload(
    url,
    makeScenarioHarnessDonePayload(rowIndex, result.scenarioHtml),
    harnessSetters,
  );

  finishScenarioRowHarness(
    url,
    rowIndex,
    {
      h2Title: result.illustrativeH2Title,
      html: result.scenarioHtml,
    },
    harnessSetters,
    cacheWrite,
    updateRow,
    result.html,
  );

  const rowFiles = aiseoRowFilesForUpload({
    runKind: "aiScenario",
    url,
    elementFiles: (() => {
      const scenarioFile = buildScenarioJsonGeneratedFile({
        h2Title: result.illustrativeH2Title,
        html: result.scenarioHtml,
      });
      return scenarioFile ? [scenarioFile] : [];
    })(),
    postHtml: result.html,
  });
  if (uploadAfterRowWrite) {
    await uploadAfterRowWrite({
      index: rowIndex,
      url,
      html: result.html,
      rowFiles: rowFiles.length ? rowFiles : undefined,
    });
  }
}

export async function runOverviewScenarioHarnessBatch(
  params: RunOverviewScenarioHarnessBatchParams,
): Promise<{ ok: number; failed: number }> {
  const {
    site,
    rows,
    rowIndices,
    sitemapSource,
    apiKey,
    model,
    harnessSetters,
    cacheWrite,
    updateRow,
    getInventoryMatchForUrl,
    uploadAfterRowWrite,
  } = params;

  const eligible = rowIndices
    .map((index) => ({ row: rows[index], index }))
    .filter((entry): entry is { row: OverviewRow; index: number } => Boolean(entry.row?.url?.trim()));

  if (!eligible.length) return { ok: 0, failed: 0 };

  const pageRanges = overviewBulkPageRanges(eligible.length);
  let ok = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageEligible = eligible.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: eligible.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Case scenario",
    });

    await mapOverviewAiCopyWithConcurrency(pageEligible, async ({ row, index }) => {
      updateRow(index, { status: "ai-scenario" });
      await runOverviewScenarioHarnessRow({
        site,
        row,
        rowIndex: index,
        sitemapSource,
        apiKey,
        model,
        harnessSetters,
        cacheWrite,
        updateRow,
        getInventoryMatchForUrl,
        uploadAfterRowWrite,
      });
      ok += 1;
    });
  }

  setScenarioHarnessMessage(harnessSetters, `Case scenario finished: ${ok} ok`, 100);

  return { ok, failed: 0 };
}
