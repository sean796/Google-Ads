import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
import { overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import {
  overviewBulkPageRanges,
  overviewBulkPageCount,
  OVERVIEW_BULK_PAGE_SIZE,
} from "@/lib/overview/overview-bulk-page-size";
import {
  initOverviewBulkHarnessPagination,
  setOverviewBulkHarnessPageState,
} from "@/lib/overview/overview-bulk-page-state";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  markTitleRowDone,
  markTitleRowError,
  markTitleRowOptimizing,
  markTitleRowSkipped,
  setTitleHarnessMessage,
  type TitleHarnessSetters,
} from "@/lib/overview/overview-ai-title-harness-mutations";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type AiTitleCatalogRow = {
  index: number;
  url: string;
  title: string;
  focusKeyword: string;
};

export type AiTitleHarnessOptimizeDeps = {
  optimizeTitle: (
    url: string,
    titleSegment: string,
    focusKeyword: string | undefined,
    faq: string | undefined,
    sentimentSource: string | undefined,
    seoResearchBrief: string | undefined,
    options?: { skipLoadingState?: boolean; titleMode?: "sap" },
  ) => Promise<string | null>;
  resolveSentimentSource: (row: OverviewRow) => Promise<string | undefined>;
};

export function initOverviewAiTitleHarnessBatchState(params: {
  site: WordPressSite;
  catalog: AiTitleCatalogRow[];
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
    prepMessage = "AI titles…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((entry) => entry.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};
  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword.trim()) urlKeywords[url] = entry.focusKeyword.trim();
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "AI titles",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: null,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "AI titles",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiTitle",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      harnessStartedAt: Date.now(),
      bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
      currentBulkPage: 1,
      totalBulkPages: Math.max(1, overviewBulkPageCount(urls.length)),
      currentStepProgress: harnessStepProgress(undefined, {
        step: "AI titles",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: null,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);
  return batchKey;
}

export function finalizeOverviewAiTitleHarnessBatch(
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
      message: "AI titles batch finished",
    });
    return next;
  });
}

export type RunOverviewAiTitleHarnessBatchParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  rowsRef: { current: OverviewRow[] };
  catalog: AiTitleCatalogRow[];
  deps: AiTitleHarnessOptimizeDeps;
  harnessSetters: TitleHarnessSetters;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewAiTitleHarnessBatch(
  params: RunOverviewAiTitleHarnessBatchParams,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const {
    site,
    sitemapSource,
    rowsRef,
    catalog,
    deps,
    harnessSetters,
    getInventoryMatchForUrl,
    updateRow,
    uploadAfterRowWrite,
  } = params;

  if (!catalog.length) return { ok: 0, failed: 0, skipped: 0 };

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;
  let skipped = 0;

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
      step: "AI titles",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((entry, localIndex) => ({
        entry,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ entry, globalRowNum }) => {
        const url = entry.url.trim();
        const row = rowsRef.current[entry.index];
        if (!url || !row) {
          failed += 1;
          return;
        }

        const label = entry.title.trim() || url;
        markTitleRowOptimizing(url, harnessSetters, globalRowNum, catalog.length, label);

        if (overviewTitleOptimizationExcluded(row, sitemapSource)) {
          markTitleRowSkipped(url, harnessSetters);
          skipped += 1;
          return;
        }

        try {
          updateRow(entry.index, { status: "ai-title" });
          const { html: postHtml } = await resolveAiseoHarnessSourceHtml({
            row,
            site,
            sitemapSource,
            getInventoryMatchForUrl,
          });

          const sentimentSource = await deps.resolveSentimentSource(row);
          const result = await deps.optimizeTitle(
            url,
            overviewTitlePrimarySegment(row.title || row.aiTitle || "") || url,
            row.focusKeyword,
            row.faq,
            sentimentSource,
            row.seoResearch?.trim() || undefined,
            {
              skipLoadingState: true,
              ...(sitemapSource === "sap" ? { titleMode: "sap" as const } : {}),
            },
          );

          if (!result?.trim()) {
            updateRow(entry.index, { status: "error" });
            markTitleRowError(url, harnessSetters, "Title optimization failed");
            failed += 1;
            return;
          }

          const cleaned = overviewTitlePrimarySegment(result);
          updateRow(entry.index, { title: cleaned, aiTitle: cleaned, status: "idle" });

          const bodyForFiles =
            postHtml.trim() || row.postContentOptimized?.trim() || row.postContent?.trim() || "";
          markTitleRowDone(url, harnessSetters, {
            title: cleaned,
            aiTitle: cleaned,
            postHtml: bodyForFiles || undefined,
          });

          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiTitle",
            url,
            elementFiles: [
              {
                name: "ai-title.json",
                content: JSON.stringify({ url, title: cleaned, aiTitle: cleaned }, null, 2),
                mimeType: "application/json;charset=utf-8",
              },
            ],
            postHtml: bodyForFiles || undefined,
          });

          if (uploadAfterRowWrite && bodyForFiles) {
            await uploadAfterRowWrite({
              index: entry.index,
              url,
              html: bodyForFiles,
              rowFiles: rowFiles.length ? rowFiles : undefined,
            });
          } else if (uploadAfterRowWrite) {
            await uploadAfterRowWrite({
              index: entry.index,
              url,
              html: row.postContentOptimized?.trim() || row.postContent?.trim() || "",
              rowFiles: rowFiles.length ? rowFiles : undefined,
            });
          }

          ok += 1;
        } catch (err) {
          updateRow(entry.index, { status: "error" });
          markTitleRowError(
            url,
            harnessSetters,
            err instanceof Error ? err.message : "Title optimization failed",
          );
          failed += 1;
        }
      },
    );
  }

  setTitleHarnessMessage(
    harnessSetters,
    `AI titles finished: ${ok} ok, ${failed} failed, ${skipped} skipped`,
    100,
  );

  return { ok, failed, skipped };
}
