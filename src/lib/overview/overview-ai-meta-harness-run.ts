import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { aiseoRowFilesForUpload } from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
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
  markMetaRowDone,
  markMetaRowError,
  markMetaRowOptimizing,
  setMetaHarnessMessage,
  type MetaHarnessSetters,
} from "@/lib/overview/overview-ai-meta-harness-mutations";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type AiMetaCatalogRow = {
  index: number;
  url: string;
  metaDescription: string;
  focusKeyword: string;
};

export type AiMetaHarnessOptimizeDeps = {
  optimizeMeta: (
    url: string,
    baseMeta: string,
    focusKeyword: string | undefined,
    faq: string | undefined,
    sentimentSource: string | undefined,
    gscQuickWinsContext: string | undefined,
    seoResearchBrief: string | undefined,
    options?: { skipLoadingState?: boolean },
  ) => Promise<string | null>;
  resolveSentimentSource: (row: OverviewRow) => Promise<string | undefined>;
  resolveGscQuickWinsContext: (row: OverviewRow) => Promise<string | undefined>;
};

export function initOverviewAiMetaHarnessBatchState(params: {
  site: WordPressSite;
  catalog: AiMetaCatalogRow[];
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
    prepMessage = "AI meta…",
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
      step: "AI meta",
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
      currentStep: "AI meta",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiMeta",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      harnessStartedAt: Date.now(),
      bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
      currentBulkPage: 1,
      totalBulkPages: Math.max(1, overviewBulkPageCount(urls.length)),
      currentStepProgress: harnessStepProgress(undefined, {
        step: "AI meta",
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

export function finalizeOverviewAiMetaHarnessBatch(
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
      message: "AI meta batch finished",
    });
    return next;
  });
}

export type RunOverviewAiMetaHarnessBatchParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  rowsRef: { current: OverviewRow[] };
  catalog: AiMetaCatalogRow[];
  deps: AiMetaHarnessOptimizeDeps;
  harnessSetters: MetaHarnessSetters;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewAiMetaHarnessBatch(
  params: RunOverviewAiMetaHarnessBatchParams,
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
  const skipped = 0;

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
      step: "AI meta",
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

        const label = entry.metaDescription.trim() || row.title?.trim() || url;
        markMetaRowOptimizing(url, harnessSetters, globalRowNum, catalog.length, label);

        try {
          updateRow(entry.index, { status: "ai-meta" });
          const { html: postHtml } = await resolveAiseoHarnessSourceHtml({
            row,
            site,
            sitemapSource,
            getInventoryMatchForUrl,
          });

          const baseMeta = row.metaDescription || row.aiMeta || "";
          const sentimentSource = await deps.resolveSentimentSource(row);
          const gscQuickWinsContext = await deps.resolveGscQuickWinsContext(row);
          const briefForMeta = row.seoResearch?.trim();
          const result = await deps.optimizeMeta(
            url,
            baseMeta,
            row.focusKeyword,
            row.faq,
            sentimentSource,
            briefForMeta ? undefined : gscQuickWinsContext,
            briefForMeta || undefined,
            { skipLoadingState: true },
          );

          if (!result?.trim()) {
            updateRow(entry.index, { status: "error" });
            markMetaRowError(url, harnessSetters, "Meta optimization failed");
            failed += 1;
            return;
          }

          const cleaned = result.trim();
          updateRow(entry.index, {
            metaDescription: cleaned,
            aiMeta: cleaned,
            status: "idle",
          });

          const bodyForFiles =
            postHtml.trim() || row.postContentOptimized?.trim() || row.postContent?.trim() || "";
          markMetaRowDone(url, harnessSetters, {
            metaDescription: cleaned,
            aiMeta: cleaned,
            postHtml: bodyForFiles || undefined,
          });

          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiMeta",
            url,
            elementFiles: [
              {
                name: "ai-meta.json",
                content: JSON.stringify(
                  { url, metaDescription: cleaned, aiMeta: cleaned },
                  null,
                  2,
                ),
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
          markMetaRowError(
            url,
            harnessSetters,
            err instanceof Error ? err.message : "Meta optimization failed",
          );
          failed += 1;
        }
      },
    );
  }

  setMetaHarnessMessage(
    harnessSetters,
    `AI meta finished: ${ok} ok, ${failed} failed, ${skipped} skipped`,
    100,
  );

  return { ok, failed, skipped };
}
