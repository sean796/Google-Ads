import { notify } from "@/lib/app-notifications";
import { notifyBatchOptimizationCompleteProcessedX, notifyCompletedOptimizationForPostXOfX } from "@/lib/notify-messages";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { mergeOptimizationProgress, updateOptimizationProgress } from "./optimization-helpers";
import { updateBulkStateForPost } from "./bulk-optimization-update-bulk-state";
import { stepLabel } from "@/lib/content-optimization/content-optimizer-run-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import { bulkOptimizationDoPrefetch, type BulkDoPrefetchArgs } from "./bulk-optimization-do-prefetch";
import type { BulkSerpWarmupController } from "./bulk-optimization-serp-warmup";
import type { BulkGoogleMapsImageWarmupController } from "./bulk-optimization-google-maps-image-warmup";
import { isAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import type { PendingOptimization } from "./use-optimization-state";
import type { ContinueOptimizationFn } from "./continue-optimization";
import type { MutableRefObject } from "react";

export interface BulkPostLoopParams {
  urls: string[];
  rangeStart?: number;
  rangeEnd?: number;
  skipUrlSet: Set<string>;
  batchKey: string;
  site: WordPressSite;
  muteToasts: boolean;
  isAcfKeywordMode: boolean;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  pendingOptimizationData: Record<string, PendingOptimization>;
  wordPressPostsForRun?: Array<Record<string, unknown>>;
  wordPressPagesForOfferTable?: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
  }>;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  bulkContinueOptimizationRef: MutableRefObject<ContinueOptimizationFn | null>;
  bulkContextRef: { current: { bulkIndex: number; totalBulkUrls: number; batchKey: string } | null };
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  setOptimizationProgress: HandleOptimizeMultipleContentParams["setOptimizationProgress"];
  recordGeneratedFilesForUrl: (siteId: string, url: string) => void;
  onBulkUrlComplete?: HandleOptimizeMultipleContentParams["onBulkUrlComplete"];
  serpWarmup: BulkSerpWarmupController;
  googleMapsImageWarmup?: BulkGoogleMapsImageWarmupController | null;
  prefetchArgs: Omit<BulkDoPrefetchArgs, "prefetchedAcfFieldsCache" | "prefetchedPendingCache" | "setBulkOptimizationState"> & {
    prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
    prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
    setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  };
}

function patchBulkMetaCompletedUrls(
  setOptimizationProgress: HandleOptimizeMultipleContentParams["setOptimizationProgress"],
  batchKey: string,
  completedUrls: number,
) {
  setOptimizationProgress((prev) => {
    const batchEntry = prev[batchKey];
    if (!batchEntry?.bulkMeta) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...batchEntry,
        bulkMeta: { ...batchEntry.bulkMeta, completedUrls, prepComplete: true },
      },
    };
  });
}

export async function bulkOptimizationRunPostLoop(p: BulkPostLoopParams): Promise<void> {
  const {
    urls,
    rangeStart = 0,
    rangeEnd = urls.length,
    skipUrlSet,
    batchKey,
    site,
    muteToasts,
    prefetchedPendingCache,
    prefetchedAcfFieldsCache,
    pendingOptimizationData,
    wordPressPostsForRun,
    wordPressPagesForOfferTable,
    optimizationFileManagers,
    bulkContinueOptimizationRef,
    bulkContextRef,
    setBulkOptimizationState,
    setOptimizationProgress,
    onBulkUrlComplete,
    serpWarmup,
    googleMapsImageWarmup,
  } = p;

  const runCount = Math.max(0, rangeEnd - rangeStart);
  let batchFailedCount = 0;
  let batchCompletedCount = 0;
  let firstBatchFailureMsg = "";

  const recordBatchFailure = (msg: string) => {
    batchFailedCount += 1;
    if (!firstBatchFailureMsg) firstBatchFailureMsg = msg;
  };

  if (!muteToasts && runCount > 0) {
    notify.info(
      rangeStart === 0 && rangeEnd === urls.length
        ? `Starting optimization of ${urls.length} posts...`
        : `Optimizing targets ${rangeStart + 1}–${rangeEnd} of ${urls.length}…`,
    );
  }

  if (rangeStart < rangeEnd) {
    googleMapsImageWarmup?.maintainBuffer(rangeStart);
  }

  const fileManagersByIndex = new Map<number, OptimizationFileManager>();

  const recordGeneratedFilesForIndex = (index: number, url: string) => {
    const fm = fileManagersByIndex.get(index);
    if (!fm) return;
    const files = fm.getFiles();
    if (!files || files.length === 0) return;
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlGeneratedFiles: {
            ...(current.urlGeneratedFiles || {}),
            [url]: files,
          },
        },
      };
    });
  };

  for (let i = rangeStart; i < rangeEnd; i++) {
    const url = urls[i]!;

    let cancelNow = false;
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (current?.cancelRequested) cancelNow = true;
      return prev;
    });
    if (cancelNow) {
      updateOptimizationProgress(setOptimizationProgress, batchKey, "done", 1, "Operation aborted by user.");
      setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...current,
            currentStep: stepLabel("done"),
            warmingUpIndex: null,
            warmingUpIndex2: null,
          },
        };
      });
      break;
    }

    if (skipUrlSet.has(url)) {
      patchBulkMetaCompletedUrls(setOptimizationProgress, batchKey, i + 1);
      updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, i + 1, urls.length, "skipped");
      continue;
    }

    googleMapsImageWarmup?.warmIndex(i);

    if (!prefetchedPendingCache.has(i)) {
      await bulkOptimizationDoPrefetch(i, p.prefetchArgs);
    }

    if (!prefetchedPendingCache.has(i)) {
      const msg = `Missing prefetch for target ${i + 1}; bulk prep should have loaded inventory first.`;
      console.error(`[Batch Optimization] ${msg}`, url);
      if (!muteToasts) notify.error(msg);
      recordBatchFailure(msg);
      setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...current,
            urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
            urlSkipReasons: { ...(current.urlSkipReasons || {}), [url]: msg },
          },
        };
      });
      updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, i + 1, urls.length, "error");
      continue;
    }

    const currentPost = i + 1;
    const totalPosts = urls.length;
    bulkContextRef.current = { bulkIndex: i, totalBulkUrls: urls.length, batchKey };

    updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, "optimizing");
    if (!isAgentRunBatchKey(batchKey)) {
      updateOptimizationProgress(setOptimizationProgress, site.id, "load", 0, url);
    }

    try {
      const fullCached = !!prefetchedPendingCache.get(i);
      if (fullCached) {
        const { pending: cachedPending, primaryKeyword: cachedKeyword } = prefetchedPendingCache.get(i)!;
        if (!bulkContinueOptimizationRef.current) {
          throw new Error("Bulk continue optimization handler is not ready.");
        }
        Object.assign(pendingOptimizationData, {
          [site.id]: {
            ...cachedPending,
            ...(wordPressPostsForRun?.length ? { wordPressPosts: wordPressPostsForRun } : {}),
            ...(wordPressPagesForOfferTable?.length ? { wordPressPagesForOfferTable } : {}),
            bulkIndex: i,
            totalBulkUrls: urls.length,
            batchKey,
          },
        });
        const fileManager = new OptimizationFileManager();
        fileManagersByIndex.set(i, fileManager);
        optimizationFileManagers[site.id] = fileManager;

        await bulkContinueOptimizationRef.current(
          site.id,
          { query: cachedKeyword, clicks: 0, impressions: 0, ctr: 0, position: 0 },
        );
        recordGeneratedFilesForIndex(i, url);
        patchBulkMetaCompletedUrls(setOptimizationProgress, batchKey, batchCompletedCount + 1);
        updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, "completed");
        batchCompletedCount += 1;
        await onBulkUrlComplete?.({ url, index: i, total: totalPosts, uploaded: true });
        if (!muteToasts) notify.success(notifyCompletedOptimizationForPostXOfX(currentPost, totalPosts));
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const msg = `Could not run bulk optimization for post ${currentPost}: missing WordPress/ACF prefetch.`;
      console.error(`[Batch Optimization] ${msg}`, url);
      if (!muteToasts) notify.error(msg);
      recordBatchFailure(msg);
      setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...current,
            urlSkipReasons: { ...(current.urlSkipReasons || {}), [url]: msg },
          },
        };
      });
      updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, "error");
      break;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Batch Optimization] Error optimizing post ${currentPost} (${url}):`, error);
      if (!muteToasts) notify.error(`Post ${currentPost} failed: ${errorMessage}`, { duration: 12000 });
      recordBatchFailure(errorMessage);
      setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...current,
            urlSkipReasons: { ...(current.urlSkipReasons || {}), [url]: errorMessage },
          },
        };
      });
      updateBulkStateForPost(setBulkOptimizationState, batchKey, url, i, currentPost, totalPosts, "error");
      continue;
    }
  }

  updateOptimizationProgress(
    setOptimizationProgress,
    batchKey,
    "done",
    1,
    batchFailedCount > 0
      ? `${batchFailedCount} of ${urls.length} targets failed`
      : batchCompletedCount === urls.length
        ? `Successfully processed ${urls.length} posts`
        : `Completed ${batchCompletedCount} of ${urls.length} posts`,
    { bulkMeta: { totalUrls: urls.length, completedUrls: batchCompletedCount, prepComplete: true } },
  );

  serpWarmup.clearWarmingIndices();
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentStep: stepLabel("done"),
        currentIndex: urls.length,
        warmingUpIndex: null,
        warmingUpIndex2: null,
        researchedUrls: [],
      },
    };
  });
  bulkContextRef.current = null;

  if (!muteToasts) {
    if (batchFailedCount > 0) {
      notify.error(`${batchFailedCount} of ${urls.length} targets failed: ${firstBatchFailureMsg}`, {
        duration: 12000,
      });
    } else {
      notify.success(notifyBatchOptimizationCompleteProcessedX(urls.length));
    }
  }
}
