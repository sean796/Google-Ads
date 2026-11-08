import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_PLEASE_SELECT_AT_LEAST_ONE_POST_TO_OPTIM } from "@/lib/notify-messages";
import { setOptimizingState, updateOptimizationProgress } from "./optimization-helpers";
import { stepLabel } from "@/lib/content-optimization/content-optimizer-run-progress";
import { buildWordPressPagesForLinkingFromInventory } from "@/lib/content-generation/extra-text-inventory-links";
import { clearSiteCache } from "@/lib/wordpress-site-cache";
import { clearValidationCache } from "@/lib/cached-link-validation";
import { clearRelevanceCache } from "@/lib/content-generation/ai-link-relevance-filter";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import type { PendingOptimization } from "./use-optimization-state";
import { seedBulkUrlKeywordsFromCaches } from "./bulk-optimization-seed-keywords";
import { createBulkSerpWarmupController } from "./bulk-optimization-serp-warmup";
import {
  bulkSapGoogleMapsImageWarmupEnabled,
  createBulkGoogleMapsImageWarmupController,
} from "./bulk-optimization-google-maps-image-warmup";
import { clearGoogleMapsImageSessionCache } from "@/lib/content-generation/google-maps-image-api";
import { bulkOptimizationRunPostLoop } from "./bulk-optimization-post-loop";
import { patchBulkPrefetchedPendingLinkPools } from "./bulk-optimization-pending-link-pools";
import { type BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import { type ContentPrepHarnessSetters } from "@/lib/overview/overview-content-prep-harness-run";
import {
  buildWaitingBatchPrepHarnessSections,
  resolveContentPrepBatchSectionTitles,
} from "@/lib/overview/overview-content-prep-harness-sections";
import { setMuteOptimizationToasts, getMuteOptimizationToasts } from "./optimization-toast-mute";
import {
  bulkRunCancelRequested,
  setupBulkOptimizationBatch,
} from "./bulk-optimization-batch-setup";
import { createBulkOptimizationBatchHarnessSteps } from "./bulk-optimization-batch-harness";
import { runBulkInventoryPrep } from "./bulk-optimization-inventory-prep";

export type { HandleOptimizeMultipleContentParams, PrefilledOverviewTarget } from "./bulk-optimization-params";

export async function handleOptimizeMultipleContent(
  params: HandleOptimizeMultipleContentParams,
): Promise<{ prepCompleted: boolean }> {
  const {
    site,
    urls,
    wordPressPosts = [],
    updateMode,
    setGscQueriesForSelection: _setGscQueriesForSelection,
    setIsKeywordSelectionOpen: _setIsKeywordSelectionOpen,
    setGscClusterAnalysis: _setGscClusterAnalysis,
    setIsAnalyzingClusters: _setIsAnalyzingClusters,
    optimizationOptions,
    inContentImageRequest,
    setIsOptimizingContent,
    setOptimizationProgress,
    setBulkOptimizationState,
    optimizationFileManagers,
    setOptimizationFileManagers,
    continueOptimizationRef,
    muteToasts = false,
    prefilledUrlKeywords = {},
    prefilledOverviewTargets = {},
    resumeCompletedUrls = [],
    prefetchedBulkInventorySnapshot,
    useSiteWarmCacheOnly = false,
    onBulkUrlComplete,
    batchKey: batchKeyOverride,
  } = params;

  if (!urls || urls.length === 0) {
    if (!muteToasts) notify.error(NOTIFY_PLEASE_SELECT_AT_LEAST_ONE_POST_TO_OPTIM);
    return { prepCompleted: false };
  }

  const batchKey = batchKeyOverride?.trim() || `${site.id}-batch`;
  const priorOptimizationToastMute = getMuteOptimizationToasts();
  const shouldMuteIntermediateToasts = !muteToasts;
  if (shouldMuteIntermediateToasts) {
    setMuteOptimizationToasts(true);
  }

  let researchBatchBlocked = false;
  setBulkOptimizationState((prev) => {
    if (prev[batchKey]?.runKind === "research") {
      researchBatchBlocked = true;
    }
    return prev;
  });
  if (researchBatchBlocked) {
    notify.error("A research batch is still running on this site. Wait for it to finish.", {
      duration: 10000,
    });
    return { prepCompleted: false };
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  const isAcfKeywordMode = true;
  const useInventoryOnlyPrep = Boolean(site.username?.trim() && site.appPassword?.trim());
  const inventorySitemapSource = optimizationOptions?.inventorySitemapSource;
  const isEntitySapRun =
    inventorySitemapSource === "sap" || optimizationOptions?.hasEntity === true;
  const prepIncludesEntitySitemap =
    isEntitySapRun || optimizationOptions?.prepEntitySitemap === true;
  const batchPrepSectionTitles = resolveContentPrepBatchSectionTitles(prepIncludesEntitySitemap);
  const batchPrepHarnessTotalSections = batchPrepSectionTitles.length;
  const waitingBatchPrepHarnessSections = () =>
    buildWaitingBatchPrepHarnessSections(batchPrepSectionTitles);

  const {
    pendingOptimizationData,
    bulkContextRef,
    prefetchedPendingCache,
    prefetchedPostFieldsCache,
    prefetchedPostPayloadByUrlIndex,
    prefetchedAcfFullPostByUrlIndex,
    setPendingOptimization,
    bulkContinueOptimizationRef,
    bulkPageRanges,
    bulkUsesPagination,
    recordGeneratedFilesForUrl,
  } = setupBulkOptimizationBatch({
    site,
    urls,
    wordPressPosts,
    prefilledUrlKeywords,
    batchKey,
    setBulkOptimizationState,
    setOptimizationProgress,
    optimizationFileManagers,
    setOptimizationFileManagers,
    continueOptimizationRef,
    setIsOptimizingContent,
    muteToasts,
    isEntitySapRun,
    waitingBatchPrepHarnessSections,
    batchPrepHarnessTotalSections,
  });

  const { markBatchPrepHarnessSectionDone, setBulkStep } = createBulkOptimizationBatchHarnessSteps({
    site,
    batchKey,
    urls,
    wordPressPosts,
    isEntitySapRun,
    batchPrepSectionTitles,
    batchPrepHarnessTotalSections,
    waitingBatchPrepHarnessSections,
    setBulkOptimizationState,
    setOptimizationProgress,
  });

  let wordPressPostsForRun = wordPressPosts;
  let wordPressPagesForOfferTable: ReturnType<typeof buildWordPressPagesForLinkingFromInventory> = [];
  let bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null = null;
  const skipUrlSet = new Set<string>(resumeCompletedUrls.filter(Boolean));
  let prepCompleted = false;

  try {

    const inventoryPrepResult = await runBulkInventoryPrep({
      site,
      urls,
      batchKey,
      useInventoryOnlyPrep,
      useSiteWarmCacheOnly,
      inventorySitemapSource,
      isEntitySapRun,
      prepIncludesEntitySitemap,
      prefetchedBulkInventorySnapshot,
      updateMode,
      optimizationOptions,
      inContentImageRequest,
      isAcfKeywordMode,
      prefilledOverviewTargets,
      prefetchedPostFieldsCache,
      prefetchedPostPayloadByUrlIndex,
      prefetchedAcfFullPostByUrlIndex,
      prefetchedPendingCache,
      setBulkOptimizationState,
      setBulkStep,
      markBatchPrepHarnessSectionDone,
      skipUrlSet,
      wordPressPosts,
    });
    bulkInventorySnapshot = inventoryPrepResult.bulkInventorySnapshot;
    wordPressPostsForRun = inventoryPrepResult.wordPressPostsForRun;
    wordPressPagesForOfferTable = inventoryPrepResult.wordPressPagesForOfferTable;
    prepCompleted = inventoryPrepResult.prepCompleted;

  patchBulkPrefetchedPendingLinkPools(
    prefetchedPendingCache,
    wordPressPostsForRun,
    wordPressPagesForOfferTable.length ? wordPressPagesForOfferTable : undefined,
  );

  if (wordPressPostsForRun.length > 0) {
    // Legacy pseudo-keys on the pending map (link pools), read by older flows only.
    setPendingOptimization((prev) =>
      ({
        ...prev,
        wordPressPosts: wordPressPostsForRun,
        wordPressPagesForOfferTable,
      }) as unknown as Record<string, PendingOptimization>,
    );
  }

  const siteServiceContext: string | null = null;

  if (!useInventoryOnlyPrep) {
    throw new Error(
      "Bulk content optimization requires WordPress credentials and a loaded inventory snapshot.",
    );
  }

  const prefetchArgsBase = {
    site,
    urls,
    batchKey,
    isAcfKeywordMode,
    updateMode,
    optimizationOptions,
    inContentImageRequest,
    wordPressPostsForRun,
    siteServiceContext,
    bulkInventorySnapshot,
    prefetchedPostPayloadByUrlIndex,
    prefetchedExistingPostByUrlIndex: new Map<number, Record<string, unknown>>(),
    prefetchedAcfFullPostByUrlIndex,
  };

  const setBulkPageState = (page: number) => {
    if (!bulkUsesPagination) return;
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          currentBulkPage: page,
          totalBulkPages: bulkPageRanges.length,
          bulkPageSize: CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
        },
      };
    });
  };

  const pageProgressLabel = (start: number, end: number, page: number, pageCount: number) =>
    bulkUsesPagination
      ? `Page ${page}/${pageCount}: targets ${start + 1}–${end} of ${urls.length}`
      : `${urls.length} targets`;

  seedBulkUrlKeywordsFromCaches({
    urls,
    batchKey,
    prefetchedPostFieldsCache,
    setBulkOptimizationState,
  });

  updateOptimizationProgress(setOptimizationProgress, batchKey, "load", 0, "Inventory loaded — starting content optimization…", {
    bulkMeta: { totalUrls: urls.length, completedUrls: 0, prepComplete: true },
  });

  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentStep: stepLabel("load"),
        currentStepProgress: {
          stepId: "load",
          subProgress: 0,
          step: stepLabel("load"),
          progress: current.currentProgress ?? 0,
          message: "Inventory loaded — starting content optimization…",
        },
      },
    };
  });

  const serpHarnessSetters: ContentPrepHarnessSetters = {
    siteId: site.id,
    batchKey,
    setBulkOptimizationState,
    setOptimizationProgress,
  };

  const serpWarmup = createBulkSerpWarmupController({
    urls,
    batchKey,
    skipUrlSet,
    muteToasts,
    prefetchedPostFieldsCache,
    prefetchedPendingCache,
    setBulkOptimizationState,
    harnessSetters: serpHarnessSetters,
  });
  serpWarmup.seedReadyFromAcf();

  const googleMapsImageWarmup = bulkSapGoogleMapsImageWarmupEnabled(optimizationOptions)
    ? createBulkGoogleMapsImageWarmupController({
        urls,
        skipUrlSet,
        prefetchedPostFieldsCache,
        prefetchedPendingCache,
      })
    : null;

  for (const { start, end, page, pageCount } of bulkPageRanges) {
      const indexRange = { start, end };
      setBulkPageState(page);

      if (bulkRunCancelRequested(batchKey, setBulkOptimizationState)) {
        break;
      }

      setBulkStep(
        "prepResearch",
        `${pageProgressLabel(start, end, page, pageCount)}: SERP warmup…`,
        0,
      );

      await bulkOptimizationRunPostLoop({
        urls,
        rangeStart: start,
        rangeEnd: end,
        skipUrlSet,
        batchKey,
        site,
        muteToasts,
        isAcfKeywordMode,
        prefetchedPendingCache,
        prefetchedPostFieldsCache,
        pendingOptimizationData,
        optimizationFileManagers,
        bulkContinueOptimizationRef,
        bulkContextRef,
        setBulkOptimizationState,
        setOptimizationProgress,
        recordGeneratedFilesForUrl,
        serpWarmup,
        googleMapsImageWarmup,
        onBulkUrlComplete,
        wordPressPostsForRun,
        wordPressPagesForOfferTable,
        prefetchArgs: {
          ...prefetchArgsBase,
          prefetchedPostFieldsCache,
          prefetchedPendingCache,
          setBulkOptimizationState,
        },
      });
    }
    return { prepCompleted };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error("[Batch Optimization] Fatal error:", error);
    if (!muteToasts) notify.error(errorMessage, { duration: 12000 });
    if (muteToasts) {
      throw error instanceof Error ? error : new Error(errorMessage);
    }
    return { prepCompleted };
  } finally {
    if (shouldMuteIntermediateToasts) {
      setMuteOptimizationToasts(priorOptimizationToastMute);
    }
    setOptimizingState(setIsOptimizingContent, batchKey, false);

    // Link-validation cache is intentionally retained across URLs for the batch; clears run here (and on cancel above), not inside bulkOptimizationRunPostLoop.
    clearSiteCache(site.id);
    clearValidationCache(site.id);
    clearRelevanceCache(site.id);
    clearGoogleMapsImageSessionCache();
  }
}
