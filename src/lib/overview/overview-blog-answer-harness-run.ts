import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  overviewBulkPageCount,
  overviewBulkPageRanges,
  OVERVIEW_BULK_PAGE_SIZE,
} from "@/lib/overview/overview-bulk-page-size";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import {
  markAnswerRowDone,
  markAnswerRowError,
  markAnswerRowOptimizing,
  setAnswerHarnessMessage,
  type AnswerHarnessSetters,
} from "@/lib/overview/overview-blog-answer-harness-mutations";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generateAndPrependAnswerHtml,
  stripLeadingAnswerSection,
  type OverviewHarnessPageKind,
} from "@/lib/overview/overview-blog-overview-prepend";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type BlogAnswerCatalogRow = {
  index: number;
  url: string;
  title: string;
  focusKeyword: string;
  html: string;
  entity?: string;
  pageKind?: OverviewHarnessPageKind;
  seoResearchBrief?: string;
};

export function initOverviewBlogAnswerHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogAnswerCatalogRow[];
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
    prepMessage = "Writing Answer…",
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
  const pageCount = Math.max(1, overviewBulkPageCount(urls.length));
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Answer",
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
      currentStep: "Answer",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiAnswer",
      harnessStartedAt: Date.now(),
      urlGeneratedFiles: {},
      bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
      currentBulkPage: 1,
      totalBulkPages: pageCount,
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Answer",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: 1,
      }),
    },
  }));

  return batchKey;
}

export function finalizeOverviewBlogAnswerHarnessBatch(
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
      message: "Answer batch finished",
    });
    return next;
  });
}

export type RunOverviewBlogAnswerHarnessBatchParams = {
  catalog: BlogAnswerCatalogRow[];
  site: WordPressSite;
  apiKey: string;
  model?: string;
  harnessSetters: AnswerHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewBlogAnswerHarnessBatch(
  params: RunOverviewBlogAnswerHarnessBatchParams,
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
      step: "Answer",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        markAnswerRowOptimizing(
          url,
          row.index,
          harnessSetters,
          globalRowNum,
          catalog.length,
          row.title || url,
        );

        const sourceBody = stripLeadingAnswerSection(row.html ?? "").trim();
        if (!sourceBody) {
          markAnswerRowError(
            url,
            harnessSetters,
            "No post HTML in inventory. Load sitemap with content, then retry Answer.",
          );
          failed += 1;
          return;
        }

        const result = await generateAndPrependAnswerHtml({
          sourceHtml: row.html ?? "",
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

        cacheWrite.push(url, result.html);
        markAnswerRowDone(url, row.index, harnessSetters, {
          answerHtml: result.answerHtml,
          postHtml: result.html,
        });
        const rowFiles = aiseoRowFilesForUpload({
          runKind: "aiAnswer",
          url,
          elementFiles: result.answerHtml?.trim()
            ? [
                {
                  name: "answer.html",
                  content: result.answerHtml.trim(),
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
        failed += 1;
        markAnswerRowError(url, harnessSetters, message);
      }
    },
    );
  }

  setAnswerHarnessMessage(
    harnessSetters,
    `Answer finished: ${ok} ok, ${failed} failed`,
    100,
  );

  return { ok, failed };
}
