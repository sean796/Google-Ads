import { logger } from "@/lib/logger";
import { getFieldsForPostsBatch, restPostFieldsFromFullPost, type WpPostSnapshotFromFieldsByUrl } from "@/lib/wordpress-api/fields-client";
import { WORDPRESS_BULK_READ_CHUNK } from "@/lib/wordpress-api/bulk-read-chunk";
import {
  lookupInventoryRowWithSource,
  inventoryRowHasUsablePrefetchData,
  normalizeMatch,
  typeHintFromCachedPost,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import type { WordPressSite } from "@/components/integrations/types";
import { hasSubstantiveSeoResearch } from "./bulk-optimization-missing-seo-research";
import { mergeSeoResearchFromAcfIntoContext, type AIDrivenACFContext } from "@/lib/content-generation/ai-driven-post-fields-reader";
import type { LinkPoolPostRow } from "./bulk-optimization-do-prefetch";

/**
 * Resolve post id + REST endpoints for ACF batch reads without extra network calls
 * (same priority order as bulk-optimization-do-prefetch).
 */
export function resolveExistingPostMetaForAcfBatch(args: {
  urlIndex: number;
  targetUrl: string;
  site: WordPressSite;
  wordPressPostsForRun: LinkPoolPostRow[];
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null;
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromFieldsByUrl>;
  prefetchedExistingPostByUrlIndex?: Map<number, Record<string, unknown>>;
}): { id: number; postTypeEndpoint: string; postTypeSubtype: string } | null {
  const {
    urlIndex,
    targetUrl,
    site,
    wordPressPostsForRun,
    bulkInventorySnapshot,
    prefetchedPostPayloadByUrlIndex,
    prefetchedExistingPostByUrlIndex,
  } = args;

  const targetNorm = normalizeMatch(site.siteUrl, targetUrl);
  const cachedPost = wordPressPostsForRun.find(
    (p) => p?.link && normalizeMatch(site.siteUrl, p.link) === targetNorm,
  );
  const typeHint = typeHintFromCachedPost(cachedPost);
  const invHit = bulkInventorySnapshot
    ? lookupInventoryRowWithSource(bulkInventorySnapshot, site.siteUrl, targetUrl, typeHint)
    : undefined;
  const invRow = invHit?.row;
  const invHasPrefetch = inventoryRowHasUsablePrefetchData(invRow);

  const contentSnapshot = prefetchedPostPayloadByUrlIndex.get(urlIndex);

  if (invHasPrefetch && invRow && invHit) {
    const postTypeEndpoint = invHit.source;
    const postTypeSubtype =
      postTypeEndpoint === "pages" ? "page" : postTypeEndpoint === "posts" ? "post" : postTypeEndpoint;
    return {
      id: Number(invRow.id),
      postTypeEndpoint,
      postTypeSubtype,
    };
  }

  if (contentSnapshot && Number.isFinite(contentSnapshot.id)) {
    return {
      id: Number(contentSnapshot.id),
      postTypeEndpoint: contentSnapshot.postTypeEndpoint,
      postTypeSubtype: contentSnapshot.postTypeSubtype,
    };
  }

  if (prefetchedExistingPostByUrlIndex?.has(urlIndex)) {
    const ep = prefetchedExistingPostByUrlIndex.get(urlIndex) as Record<string, unknown> | undefined;
    const rawId = ep?.id;
    const id = typeof rawId === "number" ? rawId : Number(rawId);
    if (Number.isFinite(id) && id > 0) {
      const endpointRaw = ep?.postTypeEndpoint;
      const subRaw = ep?.postTypeSubtype;
      const postTypeEndpoint =
        typeof endpointRaw === "string" && endpointRaw
          ? endpointRaw
          : subRaw === "page" || subRaw === "pages"
            ? "pages"
            : "posts";
      const postTypeSubtype =
        typeof subRaw === "string" && subRaw
          ? subRaw === "pages"
            ? "page"
            : subRaw
          : postTypeEndpoint === "pages"
            ? "page"
            : "post";
      return {
        id,
        postTypeEndpoint,
        postTypeSubtype,
      };
    }
  }

  if (cachedPost?.id) {
    const postTypeEndpoint =
      cachedPost.postTypeEndpoint ||
      (cachedPost.postTypeSubtype === "page" ? "pages" : "posts");
    const postTypeSubtype =
      cachedPost.postTypeSubtype || (postTypeEndpoint === "pages" ? "page" : "post");
    return {
      id: Number(cachedPost.id),
      postTypeEndpoint,
      postTypeSubtype,
    };
  }

  return null;
}

export interface PrefetchBulkAcfByPostIdArgs {
  site: WordPressSite;
  urls: string[];
  wordPressPostsForRun: LinkPoolPostRow[];
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null;
  prefetchedPostFieldsCache: Map<number, Record<string, unknown>>;
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromFieldsByUrl>;
  prefetchedExistingPostByUrlIndex?: Map<number, Record<string, unknown>>;
  prefetchedAcfFullPostByUrlIndex: Map<number, Record<string, unknown>>;
  /** When set, merge refreshed ACF (including seo_research) into pending optimization payloads. */
  prefetchedPendingCache?: Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>;
  indexRange?: { start: number; end: number };
}

function mergeAcfFieldsPreservingKeyword(
  prev: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...prev, ...incoming };
  const prevKw = String(prev.keyword_focus ?? "").trim();
  if (prevKw && !String(merged.keyword_focus ?? "").trim()) {
    merged.keyword_focus = prevKw;
  }
  return merged;
}

function syncPendingAcfFromCache(
  urlIndex: number,
  acfFields: Record<string, unknown>,
  prefetchedPendingCache:
    | Map<number, { pending: Record<string, unknown>; primaryKeyword: string }>
    | undefined,
): void {
  const pend = prefetchedPendingCache?.get(urlIndex);
  if (!pend?.pending) return;
  const p = pend.pending as Record<string, unknown>;
  const prevAf = p.acfFields && typeof p.acfFields === "object" ? (p.acfFields as Record<string, unknown>) : {};
  p.acfFields = { ...prevAf, ...acfFields };
  p.acfContext = mergeSeoResearchFromAcfIntoContext(
    p.acfFields as Record<string, unknown>,
    p.acfContext as AIDrivenACFContext | undefined,
  );
  const kw = String(acfFields.keyword_focus ?? pend.primaryKeyword ?? "").trim();
  prefetchedPendingCache!.set(urlIndex, {
    pending: p,
    primaryKeyword: kw || pend.primaryKeyword,
  });
}

/** Chunks POST /get-post-fields-batch by post id (≤ WORDPRESS_BULK_READ_CHUNK per request). */
export async function prefetchBulkAcfFieldsByPostIdForUrls(args: PrefetchBulkAcfByPostIdArgs): Promise<void> {
  const {
    site,
    urls,
    wordPressPostsForRun,
    bulkInventorySnapshot,
    prefetchedPostFieldsCache,
    prefetchedPostPayloadByUrlIndex,
    prefetchedExistingPostByUrlIndex,
    prefetchedAcfFullPostByUrlIndex,
    prefetchedPendingCache,
    indexRange,
  } = args;

  if (!site.username || !site.appPassword) return;

  const rangeStart = indexRange?.start ?? 0;
  const rangeEnd = indexRange?.end ?? urls.length;

  type Row = { urlIndex: number; postId: number; postType: string; postTypeEndpoint: string };
  const rows: Row[] = [];

  for (let urlIndex = rangeStart; urlIndex < rangeEnd; urlIndex++) {
    // Skip only when cache already has usable seo_research (keyword-only seed must still refresh).
    if (hasSubstantiveSeoResearch(prefetchedPostFieldsCache.get(urlIndex))) continue;
    const targetUrl = urls[urlIndex];
    if (!targetUrl) continue;

    const resolved = resolveExistingPostMetaForAcfBatch({
      urlIndex,
      targetUrl,
      site,
      wordPressPostsForRun,
      bulkInventorySnapshot,
      prefetchedPostPayloadByUrlIndex,
      prefetchedExistingPostByUrlIndex,
    });
    if (!resolved) continue;

    rows.push({
      urlIndex,
      postId: resolved.id,
      postType: resolved.postTypeSubtype,
      postTypeEndpoint: resolved.postTypeEndpoint,
    });
  }

  const byPostId = new Map<number, Row[]>();
  for (const r of rows) {
    const list = byPostId.get(r.postId) ?? [];
    list.push(r);
    byPostId.set(r.postId, list);
  }

  const postIds = [...byPostId.keys()];
  const CHUNK = WORDPRESS_BULK_READ_CHUNK;

  for (let i = 0; i < postIds.length; i += CHUNK) {
    const chunk = postIds.slice(i, i + CHUNK);
    const items = chunk.map((postId) => {
      const first = byPostId.get(postId)![0];
      return {
        postId: first.postId,
        postType: first.postType,
        postTypeEndpoint: first.postTypeEndpoint,
      };
    });

    const batch = await getFieldsForPostsBatch(site, items);
    if (batch.error) {
      logger.warn("[Bulk Optimization] getFieldsForPostsBatch:", batch.error);
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      const postId = chunk[j];
      const rowResult = batch.results[j];
      if (!rowResult || !rowResult.success) continue;

      const targets = byPostId.get(postId) ?? [];
      for (const t of targets) {
        let fieldsToStore = rowResult.fields;
        if (
          (!fieldsToStore || Object.keys(fieldsToStore).length === 0) &&
          rowResult.fullPost &&
          typeof rowResult.fullPost === "object"
        ) {
          const fromRest = restPostFieldsFromFullPost(rowResult.fullPost as Record<string, unknown>);
          if (Object.keys(fromRest).length > 0) {
            fieldsToStore = { ...fromRest };
          }
        }
        if (fieldsToStore && Object.keys(fieldsToStore).length > 0) {
          const prev = prefetchedPostFieldsCache.get(t.urlIndex) ?? {};
          const merged = mergeAcfFieldsPreservingKeyword(prev, fieldsToStore);
          prefetchedPostFieldsCache.set(t.urlIndex, merged);
          syncPendingAcfFromCache(t.urlIndex, merged, prefetchedPendingCache);
        }
        if (rowResult.fullPost && typeof rowResult.fullPost === "object") {
          prefetchedAcfFullPostByUrlIndex.set(t.urlIndex, rowResult.fullPost);
        }
      }
    }
  }
}
