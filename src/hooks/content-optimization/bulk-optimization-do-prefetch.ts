import { logger } from "@/lib/logger";
import type { WpPostSnapshotFromFieldsByUrl } from "@/lib/wordpress-api/fields-client";
import {
  normalizeMatch,
  lookupInventoryRowWithSource,
  inventoryRowHasUsablePrefetchData,
  existingPostFromInventoryRow,
  typeHintFromCachedPost,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { mergeSeoResearchFromAcfIntoContext, type AIDrivenACFContext } from "@/lib/content-generation/ai-driven-post-fields-reader";
import type { WordPressSite } from "@/components/integrations/types";
import type { HandleOptimizeMultipleContentParams } from "./bulk-optimization-params";
import {
  DEATH_STAR_NO_GSC,
  bulkOptimizationWpStr as wpStr,
  humanizeSlugFromUrl,
} from "./bulk-optimization-constants";
import { findEndpointFromSitemap } from "./optimization-helpers";
import {
  buildContentOptimizeHarnessPayload,
  buildWaitingContentOptimizeHarnessSections,
  contentOptimizeHarnessSectionIndex,
  CONTENT_OPTIMIZE_PIPELINE_TOTAL,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import {
  CONTENT_PREP_HARNESS_TOTAL_SECTIONS,
} from "@/lib/overview/overview-content-prep-harness-sections";
import {
  restCollectionMatchesEntitySitemap,
} from "@/lib/entity-endpoint-extractor";

export interface LinkPoolPostRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  content?: string;
  postTypeEndpoint?: string;
  postType?: string;
  postTypeSubtype?: string;
}

export interface BulkDoPrefetchArgs {
  site: WordPressSite;
  urls: string[];
  batchKey: string;
  isAcfKeywordMode: boolean;
  updateMode: HandleOptimizeMultipleContentParams["updateMode"];
  optimizationOptions: HandleOptimizeMultipleContentParams["optimizationOptions"];
  inContentImageRequest: HandleOptimizeMultipleContentParams["inContentImageRequest"];
  wordPressPostsForRun: LinkPoolPostRow[];
  siteServiceContext: string | null;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  /** From grep get-post-fields-by-url `postSnapshot` — skips redundant get-post-content. */
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromFieldsByUrl>;
  prefetchedExistingPostByUrlIndex?: Map<number, Record<string, unknown>>;
  prefetchedPendingCache: Map<
    number,
    { pending: Record<string, unknown>; primaryKeyword: string }
  >;
  setBulkOptimizationState: HandleOptimizeMultipleContentParams["setBulkOptimizationState"];
  prefetchedAcfFullPostByUrlIndex?: Map<number, Record<string, unknown>>;
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null;
}

function existingPostFromSitemapCache(cachedPost: LinkPoolPostRow | null | undefined, targetUrl: string): Record<string, unknown> | null {
  if (!cachedPost) return null;
  const ep = cachedPost.postTypeEndpoint;
  const postTypeEndpoint = ep || (cachedPost.postType === "page" ? "pages" : "posts");
  const postTypeSubtype =
    cachedPost.postTypeSubtype ||
    (postTypeEndpoint === "pages" ? "page" : postTypeEndpoint === "posts" ? "post" : postTypeEndpoint) ||
    "post";
  const id = Number(cachedPost.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    slug: cachedPost.slug || "",
    title: typeof cachedPost.title === "string" ? cachedPost.title : "",
    content: typeof cachedPost.content === "string" ? cachedPost.content : "",
    excerpt: typeof cachedPost.excerpt === "string" ? cachedPost.excerpt : "",
    link: cachedPost.link || targetUrl,
    date_gmt: cachedPost.date_gmt || "",
    postTypeEndpoint,
    postTypeSubtype,
  };
}

function stubExistingPostFromUrl(
  site: WordPressSite,
  targetUrl: string,
  invRow?: { id?: number; slug?: string; fields?: { title?: string } },
): Record<string, unknown> {
  const slugTitle = humanizeSlugFromUrl(targetUrl);
  const endpointHint =
    site.manualEndpoint || findEndpointFromSitemap(targetUrl, site) || "posts";
  const postTypeSubtype = endpointHint === "pages" ? "page" : endpointHint === "posts" ? "post" : endpointHint;
  const title = String(invRow?.fields?.title ?? "").trim() || slugTitle;
  const id = Number(invRow?.id);
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    slug: invRow?.slug || "",
    title,
    content: "",
    excerpt: "",
    link: targetUrl,
    postTypeEndpoint: endpointHint,
    postTypeSubtype,
  };
}

function touchPrefetchHarness(
  setBulkOptimizationState: BulkDoPrefetchArgs["setBulkOptimizationState"],
  batchKey: string,
  url: string,
  urlIndex: number,
  phase: "start" | "done",
): void {
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    const serpIndex = contentOptimizeHarnessSectionIndex("SERP research brief");
    const payload = buildContentOptimizeHarnessPayload(urlIndex, serpIndex, phase);
    const baseSections =
      current.urlHarnessSections?.[url] ?? buildWaitingContentOptimizeHarnessSections();
    const nextSections = reduceHarnessSectionList(baseSections, payload);
    return {
      ...prev,
      [batchKey]: {
        ...current,
        currentUrl: url,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: nextSections,
        },
        currentStepProgress: {
          stepId: "prepResearch" as const,
          subProgress: 0,
          step: "prepResearch",
          progress: 0,
          ...(current.currentStepProgress || {}),
          harnessSections: nextSections,
          harnessPlannedSectionCount: CONTENT_PREP_HARNESS_TOTAL_SECTIONS,
        },
      },
    };
  });
}

export async function bulkOptimizationDoPrefetch(
  urlIndex: number,
  args: BulkDoPrefetchArgs
): Promise<void> {
  const {
    site,
    urls,
    batchKey,
    isAcfKeywordMode,
    updateMode,
    optimizationOptions,
    inContentImageRequest,
    wordPressPostsForRun,
    siteServiceContext,
    prefetchedPostFieldsCache,
    prefetchedPostPayloadByUrlIndex,
    prefetchedExistingPostByUrlIndex,
    prefetchedPendingCache,
    setBulkOptimizationState,
    bulkInventorySnapshot,
    prefetchedAcfFullPostByUrlIndex,
  } = args;

  let cancelPrefetch = false;
  setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (current?.cancelRequested) cancelPrefetch = true;
    return prev;
  });
  if (cancelPrefetch) return;
  const targetUrl = urls[urlIndex];
  if (!targetUrl) return;
  touchPrefetchHarness(setBulkOptimizationState, batchKey, targetUrl.trim(), urlIndex, "start");
  let primaryKeyword = "";

  try {
    const urlDerivedIntent = "";
    const apiKey = loadApiKey();
    const researchModel = apiKey ? getResearchModel(site.id) : "";

    const targetNorm = normalizeMatch(site.siteUrl, targetUrl);
    const cachedPost = wordPressPostsForRun.find(
      (p) => p?.link && normalizeMatch(site.siteUrl, p.link) === targetNorm,
    );
    const typeHint = typeHintFromCachedPost(cachedPost);
    const invHit = bulkInventorySnapshot
      ? lookupInventoryRowWithSource(bulkInventorySnapshot, site.siteUrl, targetUrl, typeHint)
      : undefined;
    const invRow = invHit?.row;

    let existingPost: Record<string, unknown> | null = null;

    const contentSnapshot = prefetchedPostPayloadByUrlIndex.get(urlIndex);
    if (invHit && invRow && inventoryRowHasUsablePrefetchData(invRow)) {
      existingPost = existingPostFromInventoryRow(invHit);
    } else if (contentSnapshot && Number.isFinite(contentSnapshot.id)) {
      existingPost = {
        id: contentSnapshot.id,
        slug: contentSnapshot.slug || "",
        title: contentSnapshot.title,
        content: contentSnapshot.content,
        excerpt: contentSnapshot.excerpt,
        link: contentSnapshot.link || targetUrl,
        date_gmt: contentSnapshot.date_gmt || "",
        postTypeEndpoint: contentSnapshot.postTypeEndpoint,
        postTypeSubtype: contentSnapshot.postTypeSubtype,
      };
    } else if (prefetchedExistingPostByUrlIndex?.has(urlIndex)) {
      existingPost = prefetchedExistingPostByUrlIndex.get(urlIndex) as Record<string, unknown>;
    } else {
      existingPost = existingPostFromSitemapCache(cachedPost, targetUrl);
    }

    const seoExtraOnly = optimizationOptions?.seoExtraTextFieldOnly === true;
    if (!existingPost) {
      if (seoExtraOnly && invHit) {
        existingPost = existingPostFromInventoryRow(invHit);
      } else if (!seoExtraOnly) {
        existingPost = stubExistingPostFromUrl(site, targetUrl, invRow);
      }
    }

    if (seoExtraOnly) {
      const stubId = Number(existingPost?.id);
      if (!existingPost || !Number.isFinite(stubId) || stubId <= 0) {
        logger.warn(
          `[Bulk Optimization] SEO extra text prefetch skipped index ${urlIndex}: no bound post ID`,
          targetUrl,
        );
        return;
      }
    }

    if (
      !prefetchedPostFieldsCache.has(urlIndex) &&
      invRow?.acf &&
      typeof invRow.acf === "object" &&
      Object.keys(invRow.acf).length > 0
    ) {
      prefetchedPostFieldsCache.set(urlIndex, invRow.acf as Record<string, unknown>);
    }

    const existingTitle = wpStr(existingPost.title) || "";
    const existingContent = wpStr(existingPost.content) || "";
    const existingExcerpt = wpStr(existingPost.excerpt) || "";

    const acfKeywordEarly = String(
      (prefetchedPostFieldsCache.get(urlIndex) ?? {})["keyword_focus"] ?? "",
    ).trim();

    const postTypeEndpoint =
      String(existingPost.postTypeEndpoint || "") ||
      (existingPost.postTypeSubtype === "page" ? "pages" : "posts");
    const postTypeSubtype =
      String(existingPost.postTypeSubtype || "") ||
      (postTypeEndpoint === "pages" ? "page" : postTypeEndpoint === "posts" ? "post" : postTypeEndpoint);

    const isSapBulkRun = optimizationOptions?.inventorySitemapSource === "sap";
    const pendingHasEntity = isSapBulkRun;

    const cachedAcfFields = prefetchedPostFieldsCache.get(urlIndex);
    const acfFields: Record<string, unknown> = cachedAcfFields ? { ...cachedAcfFields } : {};
    let acfFullPostSnapshot: Record<string, unknown> | undefined;
    let acfContext: AIDrivenACFContext | undefined;

    if (cachedAcfFields) {
      acfContext = { keywordFocus: String(acfFields["keyword_focus"] ?? "").trim() };
      acfFullPostSnapshot = prefetchedAcfFullPostByUrlIndex?.get(urlIndex);
    }

    if (!acfContext) {
      acfContext = { keywordFocus: String(acfFields["keyword_focus"] ?? "").trim() };
    }

    acfContext = mergeSeoResearchFromAcfIntoContext(acfFields, acfContext);

    const acfKeywordRaw = String(acfFields["keyword_focus"] ?? "").trim();
    if (acfKeywordRaw) {
      primaryKeyword = acfKeywordRaw;
    }

    const basePendingFields = {
      site,
      url: targetUrl,
      urlDerivedIntent: urlDerivedIntent || undefined,
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
      existingTitle,
      existingContent,
      existingExcerpt,
      wordPressPosts: wordPressPostsForRun,
      inContentImageRequest,
      acfFields,
      acfContext,
      acfFullPostSnapshot,
    };

    if (isAcfKeywordMode && !(primaryKeyword && primaryKeyword.trim().length > 0)) {
      prefetchedPendingCache.set(urlIndex, {
        pending: {
          ...basePendingFields,
          optimizationOptions: {
            ...optimizationOptions,
            hasEntity: pendingHasEntity,
            useAcfKeyword: true,
            manualKeyword: "",
          },
        },
        primaryKeyword: "",
      });
      return;
    }

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
      pending: { ...basePendingFields, optimizationOptions: bulkOpts },
      primaryKeyword,
    });
    touchPrefetchHarness(setBulkOptimizationState, batchKey, targetUrl.trim(), urlIndex, "done");
  } catch (wpErr) {
    logger.warn(`[Bulk Optimization] Prefetch for index ${urlIndex} failed:`, wpErr);
    throw wpErr instanceof Error ? wpErr : new Error(String(wpErr));
  }
}
