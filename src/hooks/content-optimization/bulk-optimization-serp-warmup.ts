import {
  applyBriefToCaches,
  fetchDataForSeoSerpBriefJson,
  indexHasStoredSeoResearchBrief,
} from "./bulk-optimization-missing-seo-research";
import { pageGscQueryStringsFromPending } from "./bulk-optimization-prefetch-page-gsc";
import { readKeywordFocusFromAcfFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import {
  markContentPrepHarnessSection,
  type ContentPrepHarnessSetters,
} from "@/lib/overview/overview-content-prep-harness-run";
import { contentOptimizeHarnessSectionIndex } from "@/lib/overview/overview-content-optimize-pipeline";
import type { BulkOptimizationState } from "./use-optimization-state";

/** Content optimize runs one post at a time; no SERP warmup for posts not yet started. */
export const BULK_SERP_WARMUP_BUFFER_AHEAD = 0;

export type BulkSerpWarmupController = ReturnType<typeof createBulkSerpWarmupController>;

export type CreateBulkSerpWarmupParams = {
  urls: string[];
  batchKey: string;
  skipUrlSet: Set<string>;
  muteToasts: boolean;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  harnessSetters?: ContentPrepHarnessSetters;
};

function bulkCancelled(
  batchKey: string,
  setBulkOptimizationState: CreateBulkSerpWarmupParams["setBulkOptimizationState"],
): boolean {
  let cancelled = false;
  setBulkOptimizationState((prev: Record<string, BulkOptimizationState>) => {
    const current = prev[batchKey];
    if (current?.cancelRequested) cancelled = true;
    return prev;
  });
  return cancelled;
}

export function createBulkSerpWarmupController(params: CreateBulkSerpWarmupParams) {
  const {
    urls,
    batchKey,
    skipUrlSet,
    muteToasts,
    prefetchedPostFieldsCache,
    prefetchedPendingCache,
    setBulkOptimizationState,
    harnessSetters,
  } = params;

  const inFlight = new Map<number, Promise<boolean>>();
  const readyIndices = new Set<number>();

  const keywordFor = (index: number): string | null => {
    const acfKw = readKeywordFocusFromAcfFields(
      prefetchedPostFieldsCache.get(index) as Record<string, unknown> | undefined,
    );
    return acfKw.trim() || null;
  };

  /** If ACF has no keyword_focus, fail fast. Bulk prep requires keyword_focus on every target. */
  const ensureKeywordForIndex = async (index: number): Promise<string> => {
    const existing = keywordFor(index);
    if (existing) return existing;
    const url = urls[index];
    throw new Error(`ACF keyword_focus is required before SERP warmup (${url ?? `index ${index}`}).`);
  };

  const isIndexReady = (index: number): boolean => {
    if (index < 0 || index >= urls.length) return false;
    if (readyIndices.has(index)) return true;
    if (skipUrlSet.has(urls[index]!)) return true;
    return false;
  };

  const markUrlSerpReady = (index: number, reason: "existing" | "filled" | "skipped" = "existing") => {
    const url = urls[index];
    if (!url) return;
    readyIndices.add(index);
    setBulkOptimizationState((prev: Record<string, BulkOptimizationState>) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const researchedUrls = Array.isArray(current.researchedUrls)
        ? [...(current.researchedUrls as string[])]
        : [];
      if (!researchedUrls.includes(url)) researchedUrls.push(url);
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlSerpResearchReady: {
            ...((current.urlSerpResearchReady as Record<string, boolean>) || {}),
            [url]: true,
          },
          researchedUrls,
        },
      };
    });
    if (harnessSetters) {
      markContentPrepHarnessSection(
        url,
        contentOptimizeHarnessSectionIndex("SERP research brief"),
        "done",
        harnessSetters,
        index,
      );
    }
  };

  const setWarmingIndices = (indices: number[]) => {
    const warmingUpIndex = indices[0] ?? null;
    const warmingUpIndex2 = indices[1] ?? null;
    setBulkOptimizationState((prev: Record<string, BulkOptimizationState>) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          warmingUpIndex,
          warmingUpIndex2,
        },
      };
    });
  };

  const warmIndex = (index: number): Promise<boolean> => {
    if (index < 0 || index >= urls.length) return Promise.resolve(false);
    if (skipUrlSet.has(urls[index]!)) return Promise.resolve(false);
    if (indexHasStoredSeoResearchBrief(index, prefetchedPostFieldsCache, prefetchedPendingCache)) {
      markUrlSerpReady(index, "existing");
      return Promise.resolve(true);
    }
    if (isIndexReady(index)) {
      markUrlSerpReady(index);
      return Promise.resolve(true);
    }
    const existing = inFlight.get(index);
    if (existing) return existing;

    const url = urls[index]!;
    const run = (async () => {
      if (bulkCancelled(batchKey, setBulkOptimizationState)) return false;
      const keyword: string = await ensureKeywordForIndex(index);
      if (harnessSetters) {
        markContentPrepHarnessSection(
          url,
          contentOptimizeHarnessSectionIndex("SERP research brief"),
          "start",
          harnessSetters,
          index,
        );
      }
      const brief = await fetchDataForSeoSerpBriefJson({
        keyword,
        pageUrl: url,
        muteToasts,
        gscQueries: pageGscQueryStringsFromPending(prefetchedPendingCache.get(index)?.pending),
      });
      if (bulkCancelled(batchKey, setBulkOptimizationState)) return false;
      applyBriefToCaches(index, brief, prefetchedPostFieldsCache, prefetchedPendingCache);
      markUrlSerpReady(index, "filled");
      return true;
    })().catch((err) => {
      if (harnessSetters) {
        markContentPrepHarnessSection(
          url,
          contentOptimizeHarnessSectionIndex("SERP research brief"),
          "done",
          harnessSetters,
          index,
        );
      }
      throw err;
    }).finally(() => {
      inFlight.delete(index);
    });

    inFlight.set(index, run);
    return run;
  };

  const ensureReady = async (index: number): Promise<boolean> => {
    const cached = isIndexReady(index);
    if (cached) {
      markUrlSerpReady(index);
      return true;
    }
    return warmIndex(index);
  };

  /** Start SERP warmup for the next two posts (no content optimization). */
  const maintainBuffer = (optimizingIndex: number): void => {
    const warming: number[] = [];
    for (let offset = 1; offset <= BULK_SERP_WARMUP_BUFFER_AHEAD; offset++) {
      const nextIndex = optimizingIndex + offset;
      if (nextIndex >= urls.length) continue;
      if (skipUrlSet.has(urls[nextIndex]!)) continue;
      warming.push(nextIndex);
      if (!isIndexReady(nextIndex) && !inFlight.has(nextIndex)) {
        void warmIndex(nextIndex);
      }
    }
    setWarmingIndices(warming);
  };

  const seedReadyFromAcf = (): void => {
    for (let i = 0; i < urls.length; i++) {
      if (skipUrlSet.has(urls[i]!)) continue;
      if (indexHasStoredSeoResearchBrief(i, prefetchedPostFieldsCache, prefetchedPendingCache)) {
        markUrlSerpReady(i, "existing");
      }
    }
  };

  const clearWarmingIndices = (): void => {
    setWarmingIndices([]);
  };

  return {
    ensureReady,
    maintainBuffer,
    seedReadyFromAcf,
    clearWarmingIndices,
    isIndexReady,
  };
}
