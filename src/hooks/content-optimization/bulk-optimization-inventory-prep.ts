import { logger } from "@/lib/logger";
import { buildMergedLinkPoolRows, buildWordPressPagesForLinkingFromInventory } from "@/lib/content-generation/extra-text-inventory-links";
import { seedSiteCacheFromLinkablePosts } from "@/lib/wordpress-site-cache";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import {
  assertBulkInventorySnapshotReady,
  seedAllBulkPrefetchCachesFromInventory,
} from "./bulk-optimization-seed-from-inventory";
import { prefetchBulkAcfFieldsByPostIdForUrls } from "./bulk-optimization-prefetch-fields-by-post-id";
import {
  applyPageGscToPendingCache,
  prefetchBulkPageGscForUrls,
} from "./bulk-optimization-prefetch-page-gsc";
import { seedOverviewSeoResearchFromPrefilledTargets } from "./bulk-optimization-missing-seo-research";
import {
  getSiteMirrorIndex,
  siteHasNeoPulseWp,
} from "@/lib/wordpress-api/fields-client";
import { type BulkOptimizerInventorySnapshot } from "@/lib/wordpress-api/inventory-match";
import { ensureBulkOptimizerInventoryForRun, ensureMergedPostsPagesLinkPool, ensurePostsInventoryForHarness, ensurePagesInventoryForHarness, ensureSapInventoryForHarness } from "./bulk-optimization-load-inventory-snapshot";

export type BulkInventoryPrepArgs = {
  site: WordPressSite;
  urls: string[];
  batchKey: string;
  useInventoryOnlyPrep: boolean;
  useSiteWarmCacheOnly: boolean;
  inventorySitemapSource: NonNullable<HandleOptimizeMultipleContentParams["optimizationOptions"]>["inventorySitemapSource"];
  isEntitySapRun: boolean;
  prepIncludesEntitySitemap: boolean;
  prefetchedBulkInventorySnapshot: HandleOptimizeMultipleContentParams["prefetchedBulkInventorySnapshot"];
  updateMode: HandleOptimizeMultipleContentParams["updateMode"];
  optimizationOptions: HandleOptimizeMultipleContentParams["optimizationOptions"];
  inContentImageRequest: HandleOptimizeMultipleContentParams["inContentImageRequest"];
  isAcfKeywordMode: boolean;
  prefilledOverviewTargets: NonNullable<HandleOptimizeMultipleContentParams["prefilledOverviewTargets"]>;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPostPayloadByUrlIndex: Map<number, import("@/lib/wordpress-api/fields-client").WpPostSnapshotFromFieldsByUrl>;
  prefetchedAcfFullPostByUrlIndex: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  setBulkStep: (
    stepId: "prepInventory" | "prepResearch",
    message: string,
    subProgress: number,
    opts?: { batchSectionIndex?: number },
  ) => void;
  markBatchPrepHarnessSectionDone: (
    sectionIndex: number,
    snapshot: BulkOptimizerInventorySnapshot,
    bucket: "posts" | "pages" | "merged" | "entity",
  ) => void;
  skipUrlSet: Set<string>;
  wordPressPosts: HandleOptimizeMultipleContentParams["wordPressPosts"];
};

export async function runBulkInventoryPrep(args: BulkInventoryPrepArgs) {
  const {
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
  } = args;
  let bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null = null;
  let linkingInventorySnapshot: BulkOptimizerInventorySnapshot | null = null;
  let wordPressPostsForRun = wordPressPosts;
  let wordPressPagesForOfferTable: ReturnType<typeof buildWordPressPagesForLinkingFromInventory> = [];
  let prepCompleted = false;
  const buildLinkPoolFromInventory = async (
    onMsg?: (message: string) => void,
  ): Promise<ReturnType<typeof buildMergedLinkPoolRows>> => {
    const linkSnapshot = await ensureMergedPostsPagesLinkPool(site, onMsg);
    linkingInventorySnapshot = linkSnapshot;
    return buildMergedLinkPoolRows(linkSnapshot, site.siteUrl);
  };


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
        { includeContent: false, includeRawPostFields: false },
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
        logger.warn("[Bulk Optimization] NEO Pulse WP site index prefetch failed:", e);
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
      prefetchedPostFieldsCache,
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
        prefetchedPostFieldsCache,
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
      prefetchedPostFieldsCache,
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

  return {
    bulkInventorySnapshot,
    linkingInventorySnapshot,
    wordPressPostsForRun,
    wordPressPagesForOfferTable,
    prepCompleted,
  };
}
