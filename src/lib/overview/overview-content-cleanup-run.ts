import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { cleanupOverviewPostContent } from "@/lib/overview/overview-content-cleanup";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import {
  postBodyHtmlFromInventoryRow,
} from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import { overviewRowPatchWithoutBody } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type ContentCleanupCatalogRow = {
  index: number;
  url: string;
  html: string;
};

export type ContentCleanupSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export function initOverviewContentCleanupBatchState(params: {
  site: WordPressSite;
  catalog: ContentCleanupCatalogRow[];
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
    prepMessage = "Preparing Clean Up…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Clean Up",
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
      currentStep: "Clean Up",
      currentUrl: urls[0],
      urlKeywords: {},
      runKind: "contentCleanup",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Clean Up",
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

export function finalizeOverviewContentCleanupBatch(
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
      message: "Clean Up finished",
    });
    return next;
  });
}

function setCleanupMessage(
  setters: ContentCleanupSetters,
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
          step: "Clean Up",
          progress: pct,
          message,
        }),
      },
    };
  });
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "Clean Up",
      progress: pct,
      message,
    });
    return next;
  });
}

function writeCleanupRowFiles(
  url: string,
  setters: ContentCleanupSetters,
  artifact: {
    removedH1Count: number;
    convertedTableCount: number;
    postHtml: string;
  },
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
    const elementFile = buildAiseoElementJsonFile("cleanup.json", {
      removedH1Count: artifact.removedH1Count,
      convertedTableCount: artifact.convertedTableCount,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "contentCleanup",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml: artifact.postHtml,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: mergedFiles,
        },
      },
    };
  });
}

function markCleanupRowStatus(
  url: string,
  setters: ContentCleanupSetters,
  status: "completed" | "error" | "skipped",
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: status },
      },
    };
  });
}

/** Prefer optimized body, then post content, then inventory HTML. */
export function resolveCleanupSourceHtml(
  row: OverviewRow,
  site: WordPressSite | undefined,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
): string {
  const fromRow = resolveOverviewSourceHtml(row).trim();
  if (fromRow) return fromRow;
  const url = row.url?.trim();
  if (!url || !site) return "";
  const inv = getInventoryMatchForUrl(site, url)?.row;
  if (!inv) return "";
  return postBodyHtmlFromInventoryRow(inv)?.trim() || "";
}

export type RunOverviewContentCleanupBatchParams = {
  catalog: ContentCleanupCatalogRow[];
  harnessSetters: ContentCleanupSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  preparePage?: (info: {
    page: number;
    pageCount: number;
    start: number;
    end: number;
    pageCatalog: ContentCleanupCatalogRow[];
  }) => Promise<ContentCleanupCatalogRow[]>;
};

export async function runOverviewContentCleanupBatch(
  params: RunOverviewContentCleanupBatchParams,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const { catalog, harnessSetters, cacheWrite, updateRow, preparePage, uploadAfterRowWrite } = params;
  if (!catalog.length) return { ok: 0, failed: 0, skipped: 0 };

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const stubPageCatalog = catalog.slice(start, end);
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
      step: "Clean Up",
    });

    const pageCatalog = preparePage
      ? await preparePage({ page, pageCount, start, end, pageCatalog: stubPageCatalog })
      : stubPageCatalog;

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((entry, localIndex) => ({
        entry,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ entry, globalRowNum }) => {
      const url = entry.url.trim();
      updateRow(entry.index, { status: "content-cleanup" });
      harnessSetters.setBulkOptimizationState((prev) => {
        const current = prev[harnessSetters.batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [harnessSetters.batchKey]: {
            ...current,
            urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
            currentUrl: url,
            currentIndex: globalRowNum - 1,
          },
        };
      });

      setCleanupMessage(
        harnessSetters,
        `Clean Up ${globalRowNum}/${catalog.length}: ${url}`,
        10 + Math.round(((globalRowNum - 1) / Math.max(catalog.length, 1)) * 85),
      );

      try {
        const source = entry.html.trim();
        if (!source) {
          skipped += 1;
          markCleanupRowStatus(url, harnessSetters, "skipped");
          updateRow(entry.index, { status: "idle" });
          return;
        }

        const cleaned = cleanupOverviewPostContent(source);
        if (cleaned.removedH1Count === 0 && cleaned.convertedTableCount === 0) {
          if (cleaned.html === source) {
            skipped += 1;
            markCleanupRowStatus(url, harnessSetters, "skipped");
            updateRow(entry.index, { status: "idle" });
            return;
          }
        }

        updateRow(entry.index, overviewRowPatchWithoutBody({
          status: "idle",
        }));
        cacheWrite.push(url, cleaned.html);
        writeCleanupRowFiles(url, harnessSetters, {
          removedH1Count: cleaned.removedH1Count,
          convertedTableCount: cleaned.convertedTableCount,
          postHtml: cleaned.html,
        });
        const rowFiles = aiseoRowFilesForUpload({
          runKind: "contentCleanup",
          url,
          elementFiles: (() => {
            const elementFile = buildAiseoElementJsonFile("cleanup.json", {
              removedH1Count: cleaned.removedH1Count,
              convertedTableCount: cleaned.convertedTableCount,
            });
            return elementFile ? [elementFile] : [];
          })(),
          postHtml: cleaned.html,
        });
        if (uploadAfterRowWrite) {
          await uploadAfterRowWrite({
            index: entry.index,
            url,
            html: cleaned.html,
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        markCleanupRowStatus(url, harnessSetters, "completed");
        ok += 1;
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        markCleanupRowStatus(url, harnessSetters, "error");
        updateRow(entry.index, { status: "error" });
      }
    },
    );
  }

  setCleanupMessage(harnessSetters, `Clean Up done: ${ok} fixed, ${skipped} clean, ${failed} failed`, 100);
  return { ok, failed, skipped };
}

export function buildContentCleanupStubCatalog(
  indices: number[],
  rows: OverviewRow[],
): ContentCleanupCatalogRow[] {
  return indices
    .map((index) => {
      const row = rows[index];
      if (!row?.url?.trim()) return null;
      return {
        index,
        url: row.url.trim(),
        html: "",
      };
    })
    .filter(Boolean) as ContentCleanupCatalogRow[];
}

export function hydrateCleanupCatalogHtml(
  pageCatalog: ContentCleanupCatalogRow[],
  rows: OverviewRow[],
  site: WordPressSite,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
  patches?: Map<string, Partial<OverviewRow>>,
): ContentCleanupCatalogRow[] {
  const out: ContentCleanupCatalogRow[] = [];
  for (const entry of pageCatalog) {
    const row = rows[entry.index];
    if (!row) continue;
    const patched = patches?.get(normalizePageUrlKey(entry.url));
    const merged: OverviewRow = patched ? { ...row, ...patched } : row;
    const html = resolveCleanupSourceHtml(merged, site, getInventoryMatchForUrl);
    if (!html) continue;
    out.push({ ...entry, html });
  }
  return out;
}
