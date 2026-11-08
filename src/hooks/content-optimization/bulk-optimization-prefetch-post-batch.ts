import { logger } from "@/lib/logger";
import { getWordPressPostContent } from "@/lib/wordpress-api";
import { WORDPRESS_BULK_READ_CHUNK } from "@/lib/wordpress-api/bulk-read-chunk";
import type { WordPressSite } from "@/components/integrations/types";
import type { WpPostSnapshotFromFieldsByUrl } from "@/lib/wordpress-api/post-fields-discovery";
import {
  normalizeMatch,
  lookupInventoryRowWithSource,
  inventoryRowHasUsableBodyContent,
  inventoryRowHasUsablePrefetchData,
  typeHintFromCachedPost,
  type BulkOptimizerInventorySnapshot,
} from "@/lib/wordpress-api/inventory-match";
import type { LinkPoolPostRow } from "./bulk-optimization-do-prefetch";

const BATCH_CHUNK = WORDPRESS_BULK_READ_CHUNK;

function extractSlugFromTargetUrl(siteUrl: string, targetUrl: string): string {
  try {
    const base = siteUrl?.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const absolute = targetUrl.startsWith("http")
      ? targetUrl
      : `${base.replace(/\/$/, "")}/${targetUrl.replace(/^\//, "")}`;
    const slug = new URL(absolute).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(slug).trim();
  } catch {
    const raw =
      String(targetUrl || "")
        .split("/")
        .filter(Boolean)
        .pop() || "";
    return decodeURIComponent(raw).trim();
  }
}

export interface BulkPrefetchPostBatchArgs {
  site: WordPressSite;
  urls: string[];
  wordPressPostsForRun: LinkPoolPostRow[];
  bulkInventorySnapshot: BulkOptimizerInventorySnapshot | null;
  prefetchedPostPayloadByUrlIndex: Map<number, WpPostSnapshotFromFieldsByUrl>;
  indexRange?: { start: number; end: number };
}

/**
 * One backend POST can fetch many posts: classify URLs that still need REST bodies after inventory/grep snapshot hits,
 * then batch resolvedObjects and slug lookups in chunks.
 */
export async function prefetchBulkPostBodiesForUrls(
  args: BulkPrefetchPostBatchArgs,
): Promise<Map<number, Record<string, unknown>>> {
  const out = new Map<number, Record<string, unknown>>();
  const { site, urls, wordPressPostsForRun, bulkInventorySnapshot, prefetchedPostPayloadByUrlIndex, indexRange } =
    args;
  if (!site.username || !site.appPassword || urls.length === 0) return out;

  const rangeStart = indexRange?.start ?? 0;
  const rangeEnd = indexRange?.end ?? urls.length;

  const wpOpts = {
    entitySitemapUrl: site.entitySitemapUrl,
    ...(site.manualEndpoint ? { restEndpointHints: [site.manualEndpoint] } : {}),
  };

  const resolvedItems: { urlIndex: number; id: number; subtype: string; targetUrl: string }[] = [];
  const slugItems: { urlIndex: number; slug: string; targetUrl: string }[] = [];

  for (let urlIndex = rangeStart; urlIndex < rangeEnd; urlIndex++) {
    const targetUrl = urls[urlIndex];
    if (!targetUrl) continue;

    const targetNorm = normalizeMatch(site.siteUrl, targetUrl);
    const cachedPost = wordPressPostsForRun.find(
      (p) => p?.link && normalizeMatch(site.siteUrl, p.link) === targetNorm,
    );
    const typeHint = typeHintFromCachedPost(cachedPost);
    const invHit = bulkInventorySnapshot
      ? lookupInventoryRowWithSource(bulkInventorySnapshot, site.siteUrl, targetUrl, typeHint)
      : undefined;
    const invRow = invHit?.row;

    if (inventoryRowHasUsableBodyContent(invRow) || inventoryRowHasUsablePrefetchData(invRow)) continue;
    if (prefetchedPostPayloadByUrlIndex.has(urlIndex)) continue;

    if (cachedPost?.id) {
      const ep = cachedPost.postTypeEndpoint;
      const subtypeHint =
        cachedPost.postTypeSubtype || (ep === "pages" ? "page" : ep === "posts" ? "post" : ep) || "post";
      resolvedItems.push({
        urlIndex,
        id: Number(cachedPost.id),
        subtype: String(subtypeHint),
        targetUrl,
      });
    } else {
      const slug = extractSlugFromTargetUrl(site.siteUrl, targetUrl);
      if (!slug) continue;
      slugItems.push({ urlIndex, slug, targetUrl });
    }
  }

  for (let i = 0; i < resolvedItems.length; i += BATCH_CHUNK) {
    const chunk = resolvedItems.slice(i, i + BATCH_CHUNK);
    const resolvedObjects = chunk.map((c) => ({ id: c.id, subtype: c.subtype }));
    try {
      const postContentResult = await getWordPressPostContent(
        site.siteUrl,
        site.username,
        site.appPassword,
        undefined,
        undefined,
        resolvedObjects,
        wpOpts,
      );
      if (postContentResult.error) {
        logger.warn("[Bulk prefetch batch] getWordPressPostContent (resolved) error:", postContentResult.error);
        continue;
      }
      const posts = postContentResult.posts || [];
      const byId = new Map<number, (typeof posts)[0]>();
      for (const p of posts) {
        if (p?.id != null) byId.set(Number(p.id), p);
      }
      for (const item of chunk) {
        const p = byId.get(item.id);
        if (!p) continue;
        out.set(item.urlIndex, {
          id: p.id,
          slug: p.slug || "",
          title: p.title,
          content: p.content,
          excerpt: p.excerpt,
          link: p.link || item.targetUrl,
          date_gmt: p.date_gmt || "",
          postTypeEndpoint: p.postTypeEndpoint,
          postTypeSubtype: p.postTypeSubtype,
        });
      }
    } catch (e) {
      logger.warn("[Bulk prefetch batch] resolved chunk failed:", e);
    }
  }

  for (let i = 0; i < slugItems.length; i += BATCH_CHUNK) {
    const chunk = slugItems.slice(i, i + BATCH_CHUNK);
    const postSlugs = chunk.map((c) => c.slug);
    try {
      const postContentResult = await getWordPressPostContent(
        site.siteUrl,
        site.username,
        site.appPassword,
        undefined,
        postSlugs,
        undefined,
        wpOpts,
      );
      if (postContentResult.error) {
        logger.warn("[Bulk prefetch batch] getWordPressPostContent (slugs) error:", postContentResult.error);
        continue;
      }
      const posts = postContentResult.posts || [];
      const bySlug = new Map<string, (typeof posts)[0]>();
      for (const p of posts) {
        if (p?.slug != null) bySlug.set(String(p.slug).toLowerCase(), p);
      }
      for (const item of chunk) {
        const p = bySlug.get(item.slug.toLowerCase());
        if (!p) continue;
        out.set(item.urlIndex, {
          id: p.id,
          slug: p.slug || "",
          title: p.title,
          content: p.content,
          excerpt: p.excerpt,
          link: p.link || item.targetUrl,
          date_gmt: p.date_gmt || "",
          postTypeEndpoint: p.postTypeEndpoint,
          postTypeSubtype: p.postTypeSubtype,
        });
      }
    } catch (e) {
      logger.warn("[Bulk prefetch batch] slug chunk failed:", e);
    }
  }

  return out;
}
