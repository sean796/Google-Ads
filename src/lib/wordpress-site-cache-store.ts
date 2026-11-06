import type { WordPressSite } from '@/components/integrations/types';
import type { SiteInventoryBulkRow } from './wordpress-api/types';
import { buildSearchIndexes, mapInventoryRowsToCachedPosts } from './wordpress-site-cache-types';
import type { CachedPost, SiteContentCache } from './wordpress-site-cache-types';

// In-memory cache: Map<siteId, SiteContentCache>
export const siteCache = new Map<string, SiteContentCache>();

export function seedSiteCacheFromBulkInventory(
  site: WordPressSite,
  rows: SiteInventoryBulkRow[],
): SiteContentCache {
  const uniquePosts = mapInventoryRowsToCachedPosts(rows);
  const { titleIndex, urlIndex } = buildSearchIndexes(uniquePosts);
  const cache: SiteContentCache = {
    siteId: site.id,
    siteUrl: site.siteUrl,
    posts: uniquePosts,
    createdAt: Date.now(),
    titleIndex,
    urlIndex,
  };
  siteCache.set(site.id, cache);
  return cache;
}

export type LinkableSiteCachePost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  postType?: CachedPost['postType'];
};

/** Seed in-memory link pool from Overview sheet inventory (no WordPress scrape). */
export function seedSiteCacheFromLinkablePosts(
  site: WordPressSite,
  posts: LinkableSiteCachePost[],
): SiteContentCache {
  const uniquePosts: CachedPost[] = posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    link: p.link,
    date_gmt: p.date_gmt,
    postType: p.postType ?? 'post',
  }));
  const { titleIndex, urlIndex } = buildSearchIndexes(uniquePosts);
  const cache: SiteContentCache = {
    siteId: site.id,
    siteUrl: site.siteUrl,
    posts: uniquePosts,
    createdAt: Date.now(),
    titleIndex,
    urlIndex,
  };
  siteCache.set(site.id, cache);
  return cache;
}


/**
 * Gets the cache for a site
 */
export function getSiteCache(siteId: string): SiteContentCache | null {
  return siteCache.get(siteId) || null;
}

/**
 * Build a cache from a list of posts and set it in the global cache (for testing).
 * Call clearSiteCache(siteId) after tests to avoid leaking state.
 */
export function setSiteCacheForTest(
  siteId: string,
  siteUrl: string,
  posts: CachedPost[]
): SiteContentCache {
  const { titleIndex, urlIndex } = buildSearchIndexes(posts);
  const cache: SiteContentCache = {
    siteId,
    siteUrl,
    posts,
    createdAt: Date.now(),
    titleIndex,
    urlIndex,
  };
  siteCache.set(siteId, cache);
  return cache;
}

/** Returns cached pages/posts for a site. Query is unused; callers that need intent use OpenRouter. */
export function searchSiteCache(
  siteId: string,
  _query: string,
  limit: number = 50
): CachedPost[] {
  const cache = siteCache.get(siteId);
  if (!cache) return [];
  return cache.posts.slice(0, limit);
}

/**
 * Filters the cache using a custom predicate function
 */
export function filterSiteCache(
  siteId: string,
  predicate: (post: CachedPost) => boolean
): CachedPost[] {
  const cache = siteCache.get(siteId);
  if (!cache) {
    return [];
  }

  return cache.posts.filter(predicate);
}

/**
 * Clears the cache for a specific site
 */
export function clearSiteCache(siteId: string): void {
  const cache = siteCache.get(siteId);
  if (cache) {
    siteCache.delete(siteId);
  }
}

/**
 * Clears all caches
 */
export function clearAllCaches(): void {
  siteCache.clear();
}

/**
 * Gets cache statistics
 */
export function getCacheStats(): { siteCount: number; totalPosts: number; sites: Array<{ siteId: string; postCount: number }> } {
  const sites: Array<{ siteId: string; postCount: number }> = [];
  let totalPosts = 0;

  for (const [siteId, cache] of siteCache.entries()) {
    sites.push({ siteId, postCount: cache.posts.length });
    totalPosts += cache.posts.length;
  }

  return {
    siteCount: siteCache.size,
    totalPosts,
    sites
  };
}
