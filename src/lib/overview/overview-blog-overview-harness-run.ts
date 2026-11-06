import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  initOverviewBulkHarnessPagination,
  setOverviewBulkHarnessPageState,
} from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import {
  markOverviewRowDone,
  markOverviewRowError,
  markOverviewRowOptimizing,
  markOverviewRowSkipped,
  emitOverviewHarnessPayload,
  setOverviewHarnessMessage,
  type OverviewHarnessSetters,
} from "@/lib/overview/overview-blog-overview-harness-mutations";
import {
  formatOverviewAnalyzeMarkdown,
  formatOverviewSectionMarkdown,
  makeOverviewHarnessDonePayload,
  makeOverviewHarnessStartPayload,
  OVERVIEW_STEP_ANALYZE,
  OVERVIEW_STEP_OVERVIEW,
} from "@/lib/overview/overview-blog-overview-harness-sections";
import {
  extractOverviewSectionHtml,
  generateAndPrependOverviewHtml,
  resolveOverviewSourceHtml,
  type OverviewHarnessPageKind,
} from "@/lib/overview/overview-blog-overview-prepend";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

function isMissingBodyHtmlMessage(message: string): boolean {
  return /no html body/i.test(message);
}

export type BlogOverviewCatalogRow = {
  index: number;
  url: string;
  title: string;
  focusKeyword: string;
  html: string;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
};

export function initOverviewBlogOverviewHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogOverviewCatalogRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    catalog,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing Overview batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword) urlKeywords[url] = entry.focusKeyword;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Overview",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: 2,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Overview",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiOverview",
      harnessStartedAt: Date.now(),
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Overview",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: 2,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewBlogOverviewHarnessBatch(
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
      message: "Overview batch finished",
    });
    return next;
  });
}

export type RunOverviewBlogOverviewHarnessBatchParams = {
  catalog: BlogOverviewCatalogRow[];
  site: WordPressSite;
  apiKey: string;
  model?: string;
  harnessSetters: OverviewHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewBlogOverviewHarnessBatch(
  params: RunOverviewBlogOverviewHarnessBatchParams,
): Promise<{ ok: number; failed: number }> {
  const { catalog, site, apiKey, model, harnessSetters, cacheWrite, uploadAfterRowWrite } = params;
  if (!catalog.length) return { ok: 0, failed: 0 };

  await ensureMasterInstructionsInMemory(site.id ?? null);

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageCatalog = catalog.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: catalog.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Overview",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        markOverviewRowOptimizing(
          url,
          row.index,
          harnessSetters,
          globalRowNum,
          catalog.length,
          row.title || url,
        );

        const sourceHtml = resolveOverviewSourceHtml({ postContentOptimized: row.html }, row.html);
        if (!sourceHtml.trim()) {
          markOverviewRowSkipped(url, harnessSetters);
          return;
        }

        const bodyH2Titles = extractH2TextsFromHtml(sourceHtml).filter(
          (t) => t.trim().toLowerCase() !== "overview",
        );
        emitOverviewHarnessPayload(
          url,
          harnessSetters,
          makeOverviewHarnessStartPayload(row.index, OVERVIEW_STEP_ANALYZE),
        );
        emitOverviewHarnessPayload(
          url,
          harnessSetters,
          makeOverviewHarnessDonePayload(
            row.index,
            OVERVIEW_STEP_ANALYZE,
            formatOverviewAnalyzeMarkdown(bodyH2Titles),
          ),
        );

        emitOverviewHarnessPayload(
          url,
          harnessSetters,
          makeOverviewHarnessStartPayload(row.index, OVERVIEW_STEP_OVERVIEW),
        );

        if (row.pageKind === "entity" && !row.entity?.trim()) {
          failed += 1;
          markOverviewRowError(
            url,
            harnessSetters,
            "Could not resolve place entity for this SAP page",
          );
          return;
        }

        const result = await generateAndPrependOverviewHtml({
          sourceHtml,
          articleTitle: row.title,
          focusKeyword: row.focusKeyword,
          pageUrl: url,
          connectedSite: { name: site.name, siteUrl: site.siteUrl },
          site,
          entity: row.entity,
          pageKind: row.pageKind,
          seoResearchBrief: row.seoResearchBrief,
          apiKey,
          model,
        });

        if (!result) {
          markOverviewRowSkipped(url, harnessSetters);
          return;
        }

        const overviewHtml =
          extractOverviewSectionHtml(result.html) ||
          extractOverviewSectionHtml(result.html.slice(0, 8000));
        emitOverviewHarnessPayload(
          url,
          harnessSetters,
          makeOverviewHarnessDonePayload(
            row.index,
            OVERVIEW_STEP_OVERVIEW,
            formatOverviewSectionMarkdown(overviewHtml),
          ),
        );
        markOverviewRowDone(url, row.index, harnessSetters, {
          overviewSectionHtml: overviewHtml,
          postHtml: result.html,
        });
        cacheWrite.push(url, result.html);
        const rowFiles = aiseoRowFilesForUpload({
          runKind: "aiOverview",
          url,
          elementFiles: overviewHtml?.trim()
            ? [
                {
                  name: "overview.html",
                  content: overviewHtml.trim(),
                  mimeType: "text/html;charset=utf-8",
                },
              ]
            : [],
          postHtml: result.html,
        });
        if (uploadAfterRowWrite) {
          await uploadAfterRowWrite({
            index: row.index,
            url,
            html: result.html,
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        ok += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMissingBodyHtmlMessage(message)) {
          markOverviewRowSkipped(url, harnessSetters);
          return;
        }
        failed += 1;
        markOverviewRowError(url, harnessSetters, message);
      }
    },
    );
  }

  setOverviewHarnessMessage(
    harnessSetters,
    `Overview finished: ${ok} ok, ${failed} failed`,
    100,
  );

  return { ok, failed };
}
