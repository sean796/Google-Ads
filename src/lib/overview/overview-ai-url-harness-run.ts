import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { computeOverviewAiUrlSuggestion } from "@/lib/overview/overview-ai-url-suggest";
import type { OverviewRedirectRow } from "@/lib/overview/overview-redirect-row";
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
  markUrlRowDone,
  markUrlRowError,
  markUrlRowOptimizing,
  markUrlRowSkipped,
  setUrlHarnessMessage,
  type UrlHarnessSetters,
} from "@/lib/overview/overview-ai-url-harness-mutations";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type AiUrlCatalogRow = {
  index: number;
  url: string;
  label: string;
};

export function initOverviewAiUrlHarnessBatchState(params: {
  site: WordPressSite;
  catalog: AiUrlCatalogRow[];
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
    prepMessage = "AI URL paths…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((entry) => entry.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "AI URL paths",
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
      currentStep: "AI URL paths",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiUrl",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      harnessStartedAt: Date.now(),
      bulkPageSize: OVERVIEW_BULK_PAGE_SIZE,
      currentBulkPage: 1,
      totalBulkPages: Math.max(1, overviewBulkPageCount(urls.length)),
      currentStepProgress: harnessStepProgress(undefined, {
        step: "AI URL paths",
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

export function finalizeOverviewAiUrlHarnessBatch(
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
      message: "AI URL paths batch finished",
    });
    return next;
  });
}

export type RunOverviewAiUrlHarnessBatchParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  rowsRef: { current: OverviewRow[] };
  catalog: AiUrlCatalogRow[];
  harnessSetters: UrlHarnessSetters;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  onRedirectRow?: (redirect: OverviewRedirectRow) => void;
};

export async function runOverviewAiUrlHarnessBatch(
  params: RunOverviewAiUrlHarnessBatchParams,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const {
    site,
    sitemapSource,
    rowsRef,
    catalog,
    harnessSetters,
    getInventoryMatchForUrl,
    updateRow,
    uploadAfterRowWrite,
    onRedirectRow,
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
      step: "AI URL paths",
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

        markUrlRowOptimizing(url, harnessSetters, globalRowNum, catalog.length, entry.label);

        try {
          updateRow(entry.index, { status: "ai-url" });
          const suggestion = computeOverviewAiUrlSuggestion(row);
          if (!suggestion.ok) {
            updateRow(entry.index, { status: "error" });
            markUrlRowError(url, harnessSetters, "Invalid URL");
            failed += 1;
            return;
          }

          updateRow(entry.index, suggestion.patch);
          const suggestedPath = (suggestion.patch.aiSuggestedPath ?? "").trim();
          if (suggestion.redirect && onRedirectRow) {
            onRedirectRow(suggestion.redirect);
          }

          if (!suggestedPath && !suggestion.redirect) {
            markUrlRowSkipped(url, harnessSetters);
            skipped += 1;
            return;
          }

          const { html: postHtml } = await resolveAiseoHarnessSourceHtml({
            row: rowsRef.current[entry.index] ?? row,
            site,
            sitemapSource,
            getInventoryMatchForUrl,
          });

          const bodyForFiles =
            postHtml.trim() ||
            row.postContentOptimized?.trim() ||
            row.postContent?.trim() ||
            "";
          markUrlRowDone(url, harnessSetters, {
            aiSuggestedPath: suggestedPath,
            postHtml: bodyForFiles || undefined,
          });

          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiUrl",
            url,
            elementFiles: [
              {
                name: "ai-url.json",
                content: JSON.stringify({ url, aiSuggestedPath: suggestedPath }, null, 2),
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
          markUrlRowError(
            url,
            harnessSetters,
            err instanceof Error ? err.message : "URL optimization failed",
          );
          failed += 1;
        }
      },
    );
  }

  setUrlHarnessMessage(
    harnessSetters,
    `AI URL paths finished: ${ok} ok, ${failed} failed, ${skipped} skipped`,
    100,
  );

  return { ok, failed, skipped };
}
