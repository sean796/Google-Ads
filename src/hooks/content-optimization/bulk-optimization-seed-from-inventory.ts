import type { WordPressSite } from "@/components/integrations/types";
import type { WpPostSnapshotFromAcfByUrl } from "@/lib/wordpress-api/fields-client";
import {
  existingPostFromInventoryRow,
  lookupInventoryRowWithSource,
  normalizeMatch,
  snapshotHasInventoryEntries,
  type BulkOptimizerInventorySnapshot,
  typeHintFromCachedPost,
} from "@/lib/wordpress-api/inventory-match";
import { mergeSeoResearchFromAcfIntoContext } from "@/lib/content-generation/ai-driven-acf-reader";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import type { LinkPoolPostRow } from "./bulk-optimization-do-prefetch";
import { DEATH_STAR_NO_GSC, bulkOptimizationWpStr } from "./bulk-optimization-constants";
import { inventoryRowToAcfKeywordFields } from "./bulk-optimization-grep-acf";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { resolveSapEntityForOptimize } from "./continue-optimization-entity-helpers";

export function fullPostSnapshotFromInventoryRow(
  row: SitePostInventoryRow,
): Record<string, unknown> | null {
  if (!row.id || !row.acf || typeof row.acf !== "object") return null;
  return {
    id: row.id,
    link: row.url,
    slug: row.slug ?? "",
    acf: row.acf,
  };
}

export type SeedAllBulkPrefetchFromInventoryParams = {
  site: WordPressSite;
  urls: string[];
  batchKey: string;
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot;
  updateMode: HandleOptimizeMultipleContentParams["updateMode"];
  optimizationOptions: HandleOptimizeMultipleContentParams["optimizationOptions"];
  inContentImageRequest: HandleOptimizeMultipleContentParams["inContentImageRequest"];
  wordPressPostsForRun: LinkPoolPostRow[];
  isAcfKeywordMode: boolean;
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromAcfByUrl>;
  prefetchedAcfFullPostByUrlIndex: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<
    number,
    { pending: Record<string, unknown>; primaryKeyword: string }
  >;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
};

export function assertBulkInventorySnapshotReady(
  snapshot: BulkOptimizerInventorySnapshot | null,
): asserts snapshot is BulkOptimizerInventorySnapshot {
  if (!snapshot || !snapshotHasInventoryEntries(snapshot)) {
    throw new Error(
      "Bulk content optimization requires WordPress inventory. Load the site inventory first (Content tab / Integrations), then retry.",
    );
  }
}

function inventoryRowSkipReason(
  invHit: ReturnType<typeof lookupInventoryRowWithSource>,
): string | null {
  if (!invHit?.row) {
    return "Not in WordPress inventory";
  }
  const row = invHit.row;
  if (!row.id) return "Inventory missing post id";
  return null;
}

export type SeedBulkPrefetchFromInventoryResult = {
  urlKeywords: Record<string, string>;
  skippedUrls: Record<string, string>;
};

function postSnapshotFromInventory(
  invHit: NonNullable<ReturnType<typeof lookupInventoryRowWithSource>>,
): WpPostSnapshotFromAcfByUrl {
  const existing = existingPostFromInventoryRow(invHit);
  const postTypeEndpoint = String(existing.postTypeEndpoint || "posts");
  const postTypeSubtype =
    String(existing.postTypeSubtype || "") ||
    (postTypeEndpoint === "pages" ? "page" : postTypeEndpoint === "posts" ? "post" : postTypeEndpoint);
  return {
    id: Number(existing.id),
    slug: String(existing.slug || ""),
    title: bulkOptimizationWpStr(existing.title),
    content: bulkOptimizationWpStr(existing.content),
    excerpt: bulkOptimizationWpStr(existing.excerpt),
    date_gmt: String(existing.date_gmt || ""),
    status: "publish",
    link: String(existing.link || invHit.row.url),
    postTypeEndpoint,
    postTypeSubtype,
  };
}

/**
 * Seed all bulk prefetch caches from the session inventory snapshot (no per-URL WordPress API).
 */
export function seedAllBulkPrefetchCachesFromInventory(
  params: SeedAllBulkPrefetchFromInventoryParams,
): SeedBulkPrefetchFromInventoryResult {
  const {
    site,
    urls,
    batchKey,
    bulkInventorySnapshot,
    updateMode,
    optimizationOptions,
    inContentImageRequest,
    wordPressPostsForRun,
    prefetchedAcfFieldsCache,
    prefetchedPostPayloadByUrlIndex,
    prefetchedAcfFullPostByUrlIndex,
    prefetchedPendingCache,
    setBulkOptimizationState,
  } = params;

  assertBulkInventorySnapshotReady(bulkInventorySnapshot);

  const seoExtraOnly = optimizationOptions?.seoExtraTextFieldOnly === true;
  const urlKeywords: Record<string, string> = {};
  const skippedUrls: Record<string, string> = {};

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const targetUrl = urls[urlIndex]?.trim();
    if (!targetUrl) continue;

    const targetNorm = normalizeMatch(site.siteUrl, targetUrl);
    const cachedPost = wordPressPostsForRun.find(
      (p) => p?.link && normalizeMatch(site.siteUrl, p.link) === targetNorm,
    );
    const typeHint = typeHintFromCachedPost(cachedPost);
    const invHit = lookupInventoryRowWithSource(
      bulkInventorySnapshot,
      site.siteUrl,
      targetUrl,
      typeHint,
    );

    const skipReason = inventoryRowSkipReason(invHit);
    if (skipReason) {
      skippedUrls[targetUrl] = skipReason;
      setBulkOptimizationState((prev) => {
        const current = prev[batchKey];
        if (!current) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...current,
            urlStatuses: { ...(current.urlStatuses || {}), [targetUrl]: "skipped" },
            urlSkipReasons: { ...(current.urlSkipReasons || {}), [targetUrl]: skipReason },
          },
        };
      });
      continue;
    }
    const hit = invHit!;

    const keywordSeed = inventoryRowToAcfKeywordFields(hit.row);
    const acfFromRow =
      hit.row.acf && typeof hit.row.acf === "object"
        ? ({ ...(hit.row.acf as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const acfFields = keywordSeed ? { ...keywordSeed.acfFields } : { ...acfFromRow };
    const primaryKeyword = (
      keywordSeed?.acfKeywordRaw ||
      String(acfFields.keyword_focus ?? "").trim() ||
      ""
    ).trim();
    if (primaryKeyword) {
      acfFields.keyword_focus = primaryKeyword;
    }

    const isSapBulkRun = optimizationOptions?.inventorySitemapSource === "sap";
    if (isSapBulkRun) {
      const postTitle =
        bulkOptimizationWpStr(existingPostFromInventoryRow(hit).title)
        || String(hit.row.fields?.title ?? "").trim();
      const resolvedEntity = resolveSapEntityForOptimize({
        site,
        url: targetUrl,
        title: postTitle,
        keyword: primaryKeyword,
        acfFields,
      });
      if (resolvedEntity) {
        if (!String(acfFields.origin ?? "").trim()) acfFields.origin = resolvedEntity;
        if (!String(acfFields.service_area ?? "").trim()) acfFields.service_area = resolvedEntity;
      }
    }

    prefetchedAcfFieldsCache.set(urlIndex, acfFields);
    if (primaryKeyword) {
      urlKeywords[targetUrl] = primaryKeyword;
    }

    const postSnapshot = postSnapshotFromInventory(hit);
    prefetchedPostPayloadByUrlIndex.set(urlIndex, postSnapshot);

    const fullSnap = fullPostSnapshotFromInventoryRow(hit.row);
    if (fullSnap) {
      prefetchedAcfFullPostByUrlIndex.set(urlIndex, fullSnap);
    }

    const existingPost = existingPostFromInventoryRow(hit);
    const postTypeEndpoint = postSnapshot.postTypeEndpoint;
    const postTypeSubtype = postSnapshot.postTypeSubtype;
    const pendingHasEntity = isSapBulkRun;

    const acfContext = mergeSeoResearchFromAcfIntoContext(
      acfFields,
      primaryKeyword ? { keywordFocus: primaryKeyword } : {},
    );

    const bulkOpts = seoExtraOnly
      ? {
          ...optimizationOptions,
          optimizeContent: false,
          optimizeTitle: false,
          optimizeMeta: false,
          optimizeExcerpt: false,
          optimizeFeaturedImage: false,
          optimizeExtraText: true,
          optimizeExtraImage: false,
          hasEntity: false,
          bulkFaqMinimum4: false,
          contentOnlyUpload: true,
          useAcfKeyword: true,
          manualKeyword: "",
          autoOptimize: true,
          stagingSite: optimizationOptions?.stagingSite,
          seoExtraTextFieldOnly: true,
        }
      : {
          ...optimizationOptions,
          optimizeContent: true,
          optimizeTitle: optimizationOptions?.optimizeTitle === true,
          optimizeMeta: optimizationOptions?.optimizeMeta === true,
          optimizeExcerpt: optimizationOptions?.optimizeExcerpt === true,
          optimizeFeaturedImage: optimizationOptions?.optimizeFeaturedImage === true,
          optimizeExtraText: optimizationOptions?.optimizeExtraText === true,
          optimizeExtraImage: optimizationOptions?.optimizeExtraImage === true,
          hasEntity: pendingHasEntity,
          bulkFaqMinimum4: optimizationOptions?.bulkFaqMinimum4 === true,
          contentOnlyUpload: true,
          useAcfKeyword: true,
          manualKeyword: "",
          autoOptimize: true,
        };

    prefetchedPendingCache.set(urlIndex, {
      pending: {
        site,
        url: targetUrl,
        updateMode,
        gscResult: DEATH_STAR_NO_GSC,
        existingPost,
        resolved: {
          id: existingPost.id,
          subtype: postTypeSubtype,
          endpoint: postTypeEndpoint,
          url: targetUrl,
          link: existingPost.link || targetUrl,
          slug: existingPost.slug || "",
        },
        existingTitle: bulkOptimizationWpStr(existingPost.title),
        existingContent: bulkOptimizationWpStr(existingPost.content),
        existingExcerpt: bulkOptimizationWpStr(existingPost.excerpt),
        wordPressPosts: wordPressPostsForRun,
        inContentImageRequest,
        acfFields,
        acfContext,
        acfFullPostSnapshot: prefetchedAcfFullPostByUrlIndex.get(urlIndex),
        optimizationOptions: bulkOpts,
      },
      primaryKeyword,
    });
  }

  if (Object.keys(urlKeywords).length > 0) {
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [batchKey]: {
          ...current,
          urlKeywords: {
            ...(current.urlKeywords || {}),
            ...urlKeywords,
          },
        },
      };
    });
  }

  return { urlKeywords, skippedUrls };
}
