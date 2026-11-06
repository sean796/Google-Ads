import { notify } from "@/lib/app-notifications";
import { NOTIFY_PLEASE_SELECT_AT_LEAST_ONE_POST_TO_OPTIM, notifyProcessingXTargetsInXPagesOfX } from "@/lib/notify-messages";
import { setOptimizingState, updateOptimizationProgress } from "./optimization-helpers";
import { stepLabel, computePrepProgress } from "@/lib/content-optimization/content-optimizer-run-progress";
import { buildMergedLinkPoolRows, buildWordPressPagesForLinkingFromInventory } from "@/lib/content-generation/extra-text-inventory-links";
import { clearSiteCache, seedSiteCacheFromLinkablePosts } from "@/lib/wordpress-site-cache";
import { clearValidationCache } from "@/lib/cached-link-validation";
import { clearRelevanceCache } from "@/lib/content-generation/ai-link-relevance-filter";
import type {
  BooleanMapSetter,
  HandleOptimizeMultipleContentParams,
} from "./bulk-optimization-params";
import type { Dispatch, SetStateAction } from "react";
import type { GSCQuery } from "@/lib/gsc-query-clustering";
import type { PendingOptimization } from "./use-optimization-state";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { seedBulkUrlKeywordsFromCaches } from "./bulk-optimization-seed-keywords";
import {
  assertBulkInventorySnapshotReady,
  seedAllBulkPrefetchCachesFromInventory,
} from "./bulk-optimization-seed-from-inventory";
import { createBulkSerpWarmupController } from "./bulk-optimization-serp-warmup";
import { prefetchBulkAcfFieldsByPostIdForUrls } from "./bulk-optimization-prefetch-acf-by-post-id";
import {
  applyPageGscToPendingCache,
  prefetchBulkPageGscForUrls,
} from "./bulk-optimization-prefetch-page-gsc";
import {
  bulkSapGoogleMapsImageWarmupEnabled,
  createBulkGoogleMapsImageWarmupController,
} from "./bulk-optimization-google-maps-image-warmup";
import { clearGoogleMapsImageSessionCache } from "@/lib/content-generation/google-maps-image-api";
import { bulkOptimizationRunPostLoop } from "./bulk-optimization-post-loop";
import { patchBulkPrefetchedPendingLinkPools } from "./bulk-optimization-pending-link-pools";
import { seedOverviewSeoResearchFromPrefilledTargets } from "./bulk-optimization-missing-seo-research";
import type { WpPostSnapshotFromAcfByUrl } from "@/lib/wordpress-api/fields-client";
import {
  getSiteMirrorIndex,
  siteHasNeoPulseWp,
} from "@/lib/wordpress-api/fields-client";
import { type BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import { ensureBulkOptimizerInventoryForRun, ensureMergedPostsPagesLinkPool, ensurePostsInventoryForHarness, ensurePagesInventoryForHarness, ensureSapInventoryForHarness } from "./bulk-optimization-load-inventory-snapshot";
import {
  CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
  contentOptimizerBulkPageRanges,
  contentOptimizerBulkUsesPagination,
} from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import {
  buildContentPrepUrlHarnessMap,
  type ContentPrepHarnessSetters,
} from "@/lib/overview/overview-content-prep-harness-run";
import {
  applyBatchPrepHarnessPayload,
  buildBatchPrepHarnessPayload,
  buildWaitingBatchPrepHarnessSections,
  resolveContentPrepBatchSectionTitles,
} from "@/lib/overview/overview-content-prep-harness-sections";
import {
  buildContentOptimizeHarnessPayload,
  buildWaitingContentOptimizeHarnessSections,
  contentOptimizeHarnessSectionIndex,
  CONTENT_OPTIMIZE_PIPELINE_TOTAL,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { sanitizeHarnessArticleTitle } from "@/lib/overview/overview-content-optimize-pipeline";
import {
  buildEntityBucketHarnessMarkdown,
  buildInventoryBucketHarnessMarkdown,
  buildMergedInventoryHarnessMarkdown,
} from "@/lib/overview/overview-inventory-csv";
import { setMuteOptimizationToasts, getMuteOptimizationToasts } from "./optimization-toast-mute";

function articleTitleByUrlFromPosts(
  urls: string[],
  wordPressPosts?: HandleOptimizeMultipleContentParams["wordPressPosts"],
  keywordByUrl?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const url of urls) {
    const key = normalizePageUrlKey(url);
    const post = wordPressPosts?.find((entry) => normalizePageUrlKey(entry.link) === key);
    const raw = post?.title?.trim() ?? "";
    const sanitized = sanitizeHarnessArticleTitle(raw, {
      pageUrl: url,
      keyword: keywordByUrl?.[url],
    });
    if (sanitized) map[url] = sanitized;
  }
  return map;
}


function bulkRunCancelRequested(
  batchKey: string,
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"],
): boolean {
  let cancelled = false;
  setBulkOptimizationState((prev) => {
    if (prev[batchKey]?.cancelRequested) cancelled = true;
    return prev;
  });
  return cancelled;
}
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

  const pendingOptimizationData: Record<string, PendingOptimization> = {};
  const bulkContextRef: { current: { bulkIndex: number; totalBulkUrls: number; batchKey: string } | null } = {
    current: null,
  };
  const prefetchedPendingCache = new Map<
    number,
    { pending: Record<string, unknown>; primaryKeyword: string }
  >();
  const prefetchedAcfFieldsCache = new Map<number, Record<string, unknown>>();
  const prefetchedPostPayloadByUrlIndex = new Map<number, WpPostSnapshotFromAcfByUrl>();
  const prefetchedAcfFullPostByUrlIndex = new Map<number, Record<string, unknown>>();
  const setPendingOptimization: Dispatch<
    SetStateAction<Record<string, PendingOptimization>>
  > = (action) => {
    const updated =
      typeof action === "function"
        ? (
            action as (
              prev: Record<string, PendingOptimization>,
            ) => Record<string, PendingOptimization>
          )(pendingOptimizationData)
        : action;
    Object.assign(pendingOptimizationData, updated);
    const ctx = bulkContextRef.current;
    if (ctx && pendingOptimizationData[site.id] && typeof pendingOptimizationData[site.id] === "object") {
      Object.assign(pendingOptimizationData[site.id], {
        bulkIndex: ctx.bulkIndex,
        totalBulkUrls: ctx.totalBulkUrls,
        batchKey: ctx.batchKey,
      });
    }
  };

  const bulkContinueOptimizationRef = {
    ...continueOptimizationRef,
    current: async (
      siteId: string,
      selectedKeyword: GSCQuery,
      clusterKeywords?: string[],
      setIsKeywordSelectionOpen?: BooleanMapSetter,
      testMode?: boolean,
      secondaryKeywords?: string[]
    ) => {
      const { continueOptimizationWithKeyword: continueOptimizationWithKeywordModule } = await import(
        "./continue-optimization"
      );
      await continueOptimizationWithKeywordModule({
        siteId,
        selectedKeyword,
        clusterKeywords,
        setIsKeywordSelectionOpen,
        testMode: testMode || false,
        secondaryKeywords,
        pendingOptimization: pendingOptimizationData,
        optimizationFileManagers,
        setPendingOptimization,
        setOptimizationFileManagers: () => {},
        setOptimizationProgress,
        setIsOptimizingContent,
        setBulkOptimizationState,
      });
    },
  };

  const initialUrlStatuses: Record<string, "pending" | "optimizing" | "completed" | "skipped" | "error"> = {};
  urls.forEach((url) => {
    initialUrlStatuses[url] = "pending";
  });

  const bulkPageRanges = contentOptimizerBulkPageRanges(urls.length);
  const bulkUsesPagination = contentOptimizerBulkUsesPagination(urls.length);

  setBulkOptimizationState((prev) => {
    const existing = prev[batchKey];
    const batchPrepHarnessSections = waitingBatchPrepHarnessSections();
    const articleTitleByUrl = articleTitleByUrlFromPosts(urls, wordPressPosts, prefilledUrlKeywords);
    const urlHarnessSections = buildContentPrepUrlHarnessMap(
      urls,
      articleTitleByUrl,
      prefilledUrlKeywords,
      existing?.urlEntities,
      isEntitySapRun,
    );
    const firstUrl = urls[0]?.trim() ?? "";
    return {
      ...prev,
      [batchKey]: {
        urls,
        currentIndex: 0,
        urlStatuses: initialUrlStatuses,
        currentStep: stepLabel("prepInventory"),
        currentProgress: 0,
        currentUrl: firstUrl,
        urlKeywords: { ...prefilledUrlKeywords, ...(existing?.urlKeywords || {}) },
        urlSerpResearchReady: {},
        urlGeneratedFiles: {},
        warmingUpIndex: null,
        warmingUpIndex2: null,
        researchedUrls: [],
        urlHarnessSections,
        batchPrepHarnessSections,
        currentStepProgress: {
          stepId: "prepInventory",
          subProgress: 0,
          step: stepLabel("prepInventory"),
          progress: 0,
          message: "Initializing batch…",
          harnessSections: batchPrepHarnessSections,
          harnessPlannedSectionCount: batchPrepHarnessTotalSections,
        },
        ...(bulkUsesPagination
          ? {
              bulkPageSize: CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
              totalBulkPages: bulkPageRanges.length,
              currentBulkPage: 1,
            }
          : {}),
      },
    };
  });

  if (bulkUsesPagination && !muteToasts) {
    notify.info(
      notifyProcessingXTargetsInXPagesOfX(urls.length, bulkPageRanges.length, CONTENT_OPTIMIZER_BULK_PAGE_SIZE),
    );
  }

  const emptyFileManager = new OptimizationFileManager();
  optimizationFileManagers[site.id] = emptyFileManager;
  setOptimizationFileManagers?.((prev: Record<string, OptimizationFileManager>) => ({
    ...prev,
    [site.id]: emptyFileManager,
  }));

  updateOptimizationProgress(setOptimizationProgress, batchKey, "prepInventory", 0, "Initializing batch…", {
    bulkMeta: { totalUrls: urls.length, completedUrls: 0, prepComplete: false },
    generatedFiles: [],
    harnessSections: [],
  });
  updateOptimizationProgress(setOptimizationProgress, site.id, "prepInventory", 0, "Initializing batch…", {
    generatedFiles: [],
    harnessSections: [],
  });

  const recordGeneratedFilesForUrl = (siteId: string, url: string) => {
    const fm = optimizationFileManagers[siteId];
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

  let wordPressPostsForRun = wordPressPosts;
  let wordPressPagesForOfferTable: ReturnType<typeof buildWordPressPagesForLinkingFromInventory> = [];

  const markBatchPrepHarnessSectionDone = (
    sectionIndex: number,
    snapshot: BulkOptimizerInventorySnapshot,
    bucket: "posts" | "pages" | "merged" | "entity",
  ) => {
    const markdownSlice =
      bucket === "merged"
        ? buildMergedInventoryHarnessMarkdown(snapshot, site.siteUrl)
        : bucket === "entity"
          ? buildEntityBucketHarnessMarkdown(snapshot, site.siteUrl)
          : buildInventoryBucketHarnessMarkdown(snapshot, site.siteUrl, bucket);
    const rowCount =
      bucket === "merged"
        ? snapshot.postsMaps.byLink.size + snapshot.pagesMaps.byLink.size
        : bucket === "entity"
          ? Object.values(snapshot.customMapsByCollection ?? {}).reduce(
              (n, maps) => n + maps.byLink.size,
              0,
            )
          : bucket === "posts"
            ? snapshot.postsMaps.byLink.size
            : snapshot.pagesMaps.byLink.size;
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const waitingSections = waitingBatchPrepHarnessSections();
      const base = current.batchPrepHarnessSections ?? waitingSections;
      const nextSections = applyBatchPrepHarnessPayload(
        base,
        buildBatchPrepHarnessPayload(sectionIndex, "done", markdownSlice, batchPrepSectionTitles),
        waitingSections,
      );
      const doneCount = nextSections.filter((s: { status: string }) => s.status === "done").length;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          batchPrepHarnessSections: nextSections,
          currentStepProgress: {
            stepId: "prepInventory" as const,
            subProgress: 0,
            step: "prepInventory",
            progress: 0,
            ...(current.currentStepProgress || {}),
            harnessSections: nextSections,
            harnessPlannedSectionCount: batchPrepHarnessTotalSections,
          },
        },
      };
    });
  };

  const setBulkStep = (
    stepId: "prepInventory" | "prepResearch",
    message: string,
    subProgress: number,
    opts?: { batchSectionIndex?: number },
  ) => {
    const progress = computePrepProgress(stepId, subProgress);
    updateOptimizationProgress(setOptimizationProgress, batchKey, stepId, subProgress, message);
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      const activeUrl = (current.currentUrl || urls[current.currentIndex ?? 0] || urls[0] || "").trim();
      let batchPrepHarnessSections =
        current.batchPrepHarnessSections ?? waitingBatchPrepHarnessSections();
      let urlHarnessSections =
        current.urlHarnessSections ??
        buildContentPrepUrlHarnessMap(
          urls,
          articleTitleByUrlFromPosts(urls, wordPressPosts, current.urlKeywords),
          current.urlKeywords,
          current.urlEntities,
          isEntitySapRun,
        );
      if (stepId === "prepInventory" && opts?.batchSectionIndex !== undefined) {
        const sectionIndex = opts.batchSectionIndex;
        const existingSection = batchPrepHarnessSections.find((s) => s.sectionIndex === sectionIndex);
        if (existingSection?.status !== "done") {
          batchPrepHarnessSections = applyBatchPrepHarnessPayload(
            batchPrepHarnessSections,
            buildBatchPrepHarnessPayload(sectionIndex, "start", undefined, batchPrepSectionTitles),
            waitingBatchPrepHarnessSections(),
          );
        }
      } else if (stepId === "prepResearch" && activeUrl) {
        const serpIndex = contentOptimizeHarnessSectionIndex("SERP research brief");
        const payload = buildContentOptimizeHarnessPayload(current.currentIndex ?? 0, serpIndex, "start");
        const baseSections =
          urlHarnessSections[activeUrl] ?? buildWaitingContentOptimizeHarnessSections();
        urlHarnessSections = {
          ...urlHarnessSections,
          [activeUrl]: reduceHarnessSectionList(baseSections, payload),
        };
      }
      const harnessForProgress =
        stepId === "prepResearch" && activeUrl ? urlHarnessSections[activeUrl] : batchPrepHarnessSections;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          currentStep: stepLabel(stepId),
          currentProgress: progress,
          currentStepProgress: {
            stepId,
            subProgress,
            step: stepLabel(stepId),
            progress,
            message,
            harnessSections: harnessForProgress,
            harnessPlannedSectionCount:
              stepId === "prepResearch"
                ? CONTENT_OPTIMIZE_PIPELINE_TOTAL
                : batchPrepHarnessTotalSections,
          },
          batchPrepHarnessSections,
          urlHarnessSections,
        },
      };
    });
  };

  let linkingInventorySnapshot: BulkOptimizerInventorySnapshot | null = null;

  const buildLinkPoolFromInventory = async (
    onMsg?: (message: string) => void,
  ): Promise<ReturnType<typeof buildMergedLinkPoolRows>> => {
    const linkSnapshot = await ensureMergedPostsPagesLinkPool(site, onMsg);
    linkingInventorySnapshot = linkSnapshot;
    return buildMergedLinkPoolRows(linkSnapshot, site.siteUrl);
  };

  let bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null = null;
  const skipUrlSet = new Set<string>(resumeCompletedUrls.filter(Boolean));
  let prepCompleted = false;

  try {

  if (useInventoryOnlyPrep) {
    setBulkStep(
      "prepInventory",
      useSiteWarmCacheOnly ? "Starting optimization…" : "Loading site inventory…",
      0.1,
    );
    bulkInventorySnapshot =
      prefetchedBulkInventorySnapshot ??
      (await ensureBulkOptimizerInventoryForRun(
        site,
        urls,
        inventorySitemapSource ?? (isEntitySapRun ? "sap" : undefined),
        (msg) => setBulkStep("prepInventory", msg, 0.25),
        { requireBody: false, requireKeyword: false },
        { warmCacheOnly: useSiteWarmCacheOnly },
      ));
    assertBulkInventorySnapshotReady(bulkInventorySnapshot);

    if (useSiteWarmCacheOnly) {
      const [postsSnapshot, pagesSnapshot] = await Promise.all([
        ensurePostsInventoryForHarness(site, (msg) =>
          setBulkStep("prepInventory", msg, 0.4, { batchSectionIndex: 0 }),
        ),
        ensurePagesInventoryForHarness(site, (msg) =>
          setBulkStep("prepInventory", msg, 0.55, { batchSectionIndex: 1 }),
        ),
      ]);
      linkingInventorySnapshot = {
        postsMaps: postsSnapshot.postsMaps,
        pagesMaps: pagesSnapshot.pagesMaps,
        customMapsByCollection: {},
      };
      markBatchPrepHarnessSectionDone(0, postsSnapshot, "posts");
      markBatchPrepHarnessSectionDone(1, pagesSnapshot, "pages");
      if (prepIncludesEntitySitemap) {
        markBatchPrepHarnessSectionDone(2, bulkInventorySnapshot, "entity");
      }
      if (isEntitySapRun) {
        wordPressPagesForOfferTable = buildWordPressPagesForLinkingFromInventory(
          pagesSnapshot,
          site.siteUrl,
        );
      }
      wordPressPostsForRun = buildMergedLinkPoolRows(linkingInventorySnapshot, site.siteUrl);
      if (wordPressPostsForRun.length > 0) {
        seedSiteCacheFromLinkablePosts(site, wordPressPostsForRun);
      }
    } else {
    const [postsSnapshot, pagesSnapshot] = await Promise.all([
      ensurePostsInventoryForHarness(site, (msg) =>
        setBulkStep("prepInventory", msg, 0.4, { batchSectionIndex: 0 }),
      ),
      ensurePagesInventoryForHarness(site, (msg) =>
        setBulkStep("prepInventory", msg, 0.55, { batchSectionIndex: 1 }),
      ),
    ]);
    linkingInventorySnapshot = {
      postsMaps: postsSnapshot.postsMaps,
      pagesMaps: pagesSnapshot.pagesMaps,
      customMapsByCollection: {},
    };
    markBatchPrepHarnessSectionDone(0, postsSnapshot, "posts");
    markBatchPrepHarnessSectionDone(1, pagesSnapshot, "pages");

    if (prepIncludesEntitySitemap) {
      const sapSnapshot = await ensureSapInventoryForHarness(
        site,
        (msg) => setBulkStep("prepInventory", msg, 0.7, { batchSectionIndex: 2 }),
        { includeContent: false, includeRawAcf: false },
      );
      markBatchPrepHarnessSectionDone(2, sapSnapshot, "entity");
    }

    if (isEntitySapRun) {
      wordPressPagesForOfferTable = buildWordPressPagesForLinkingFromInventory(
        pagesSnapshot,
        site.siteUrl,
      );
    }

    setBulkStep("prepInventory", "Building link pool…", 0.75);

    wordPressPostsForRun = await buildLinkPoolFromInventory((msg) =>
      setBulkStep("prepInventory", msg, 0.85),
    );
    if (wordPressPostsForRun.length > 0) {
      seedSiteCacheFromLinkablePosts(site, wordPressPostsForRun);
    }

    if (siteHasNeoPulseWp(site)) {
      void getSiteMirrorIndex(site).catch((e) => {
        console.warn("[Bulk Optimization] NEO Pulse WP site index prefetch failed:", e);
      });
    }
    }

    const seedResult = seedAllBulkPrefetchCachesFromInventory({
      site,
      urls,
      batchKey,
      bulkInventorySnapshot,
      updateMode,
      optimizationOptions,
      inContentImageRequest,
      wordPressPostsForRun,
      isAcfKeywordMode,
      prefetchedAcfFieldsCache,
      prefetchedPostPayloadByUrlIndex,
      prefetchedAcfFullPostByUrlIndex,
      prefetchedPendingCache,
      setBulkOptimizationState,
    });
    for (const skippedUrl of Object.keys(seedResult.skippedUrls)) {
      skipUrlSet.add(skippedUrl);
    }

    if (!useSiteWarmCacheOnly) {
      setBulkStep("prepInventory", "Loading ACF fields…", 0.9);
      await prefetchBulkAcfFieldsByPostIdForUrls({
        site,
        urls,
        wordPressPostsForRun,
        bulkInventorySnapshot,
        prefetchedAcfFieldsCache,
        prefetchedPostPayloadByUrlIndex,
        prefetchedAcfFullPostByUrlIndex,
        prefetchedPendingCache,
      });

      setBulkStep("prepInventory", "Prefetching page GSC…", 0.95);
      const pageGscCache = await prefetchBulkPageGscForUrls(site.siteUrl, urls);
      applyPageGscToPendingCache(urls, prefetchedPendingCache, pageGscCache);
    }

    seedOverviewSeoResearchFromPrefilledTargets({
      urls,
      prefilledOverviewTargets,
      prefetchedAcfFieldsCache,
      prefetchedPendingCache,
      batchKey,
      setBulkOptimizationState,
    });

    setBulkStep(
      "prepInventory",
      useSiteWarmCacheOnly ? "Starting optimization…" : "Inventory ready",
      1,
    );
    prepCompleted = true;
  }

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
    prefetchedAcfFieldsCache,
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
    prefetchedAcfFieldsCache,
    prefetchedPendingCache,
    setBulkOptimizationState,
    harnessSetters: serpHarnessSetters,
  });
  serpWarmup.seedReadyFromAcf();

  const googleMapsImageWarmup = bulkSapGoogleMapsImageWarmupEnabled(optimizationOptions)
    ? createBulkGoogleMapsImageWarmupController({
        urls,
        skipUrlSet,
        prefetchedAcfFieldsCache,
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
        prefetchedAcfFieldsCache,
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
          prefetchedAcfFieldsCache,
          prefetchedPendingCache,
          setBulkOptimizationState,
        },
      });
    }
    return { prepCompleted };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Batch Optimization] Fatal error:", error);
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
