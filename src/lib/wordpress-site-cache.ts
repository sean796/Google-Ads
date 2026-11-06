/**
 * WordPress Site Content Cache
 * In-memory cache for site content (URLs, titles, metas) to avoid repeated API calls
 * Cache is created per-site at optimization start and cleared when done
 */

import type { WordPressSite } from '@/components/integrations/types';
import { 
  getPublishedPosts, 
  getPublishedServiceAreas,
  getSitePageInventory,
  parseSitemap,
  detectSitemaps 
} from './wordpress-api';
import type { SiteInventoryBulkRow } from './wordpress-api/types';
import { getBulkGenerationWpInventoryIfReady } from './bulk/bulk-generation-wp-inventory';

export interface CachedPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  postType?: 'post' | 'page' | 'service-area';
}

export interface SiteDigest {
  siteId: string;
  topicClusters: string;
  linkablePostsCompact: string;
  generatedAt: number;
}

export interface SiteContentCache {
  siteId: string;
  siteUrl: string;
  posts: CachedPost[];
  createdAt: number;
  /** word (lowercase) -> posts that contain that word in title (for O(1) candidate lookup) */
  titleIndex: Map<string, CachedPost[]>;
  /** normalized URL (lowercase, no trailing slash) -> post for O(1) URL lookup */
  urlIndex: Map<string, CachedPost>;
  /** optional AI-compressed site summary for token-efficient prompts */
  siteDigest?: SiteDigest;
}

// In-memory cache: Map<siteId, SiteContentCache>
const siteCache = new Map<string, SiteContentCache>();

/** Tokenize title into lowercase words (non-empty). */
function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);
}

/**
 * Build title index (word -> posts) and url index (normalized URL -> post) for O(1) lookups.
 */
function buildSearchIndexes(posts: CachedPost[]): {
  titleIndex: Map<string, CachedPost[]>;
  urlIndex: Map<string, CachedPost>;
} {
  const titleIndex = new Map<string, CachedPost[]>();
  const urlIndex = new Map<string, CachedPost>();

  for (const post of posts) {
    for (const word of tokenizeTitle(post.title)) {
      const arr = titleIndex.get(word) ?? [];
      arr.push(post);
      titleIndex.set(word, arr);
    }
    if (post.link?.trim()) {
      const norm = post.link.trim().toLowerCase().replace(/\/+$/, '');
      urlIndex.set(norm, post);
      urlIndex.set(norm + '/', post);
    }
  }

  return { titleIndex, urlIndex };
}

function mapInventoryRowsToCachedPosts(rows: SiteInventoryBulkRow[]): CachedPost[] {
  const seen = new Set<string>();
  const out: CachedPost[] = [];
  for (const row of rows) {
    const link = row.url?.trim();
    if (!link) continue;
    const norm = link.toLowerCase().replace(/\/+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    const coll = row.collection ?? 'post';
    const postType: CachedPost['postType'] =
      coll === 'pages' || coll === 'page'
        ? 'page'
        : coll !== 'posts' && coll !== 'post'
          ? 'service-area'
          : 'post';
    out.push({
      id: row.id ?? 0,
      slug: row.slug ?? '',
      title: row.fields?.title ?? '',
      excerpt: (row.fields?.excerpt ?? '').replace(/<[^>]+>/g, '').substring(0, 200),
      link,
      date_gmt: row.date_gmt ?? '',
      postType,
    });
  }
  return out;
}

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
 * Creates a site content cache by scraping the entire site
 * Intelligently prioritizes content based on post type being optimized
 */
export async function createSiteCache(
  site: WordPressSite,
  postType?: 'post' | 'service-area' | 'page',
  onProgress?: (message: string, progress?: number) => void
): Promise<SiteContentCache> {
  const siteId = site.id;
  
  // Check if cache already exists
  const existingCache = siteCache.get(siteId);
  if (existingCache) {
    console.log(`[Site Cache] Using existing cache for site ${siteId} (${existingCache.posts.length} posts)`);
    return existingCache;
  }

  const bulkRows = getBulkGenerationWpInventoryIfReady(siteId);
  if (bulkRows?.length) {
    onProgress?.(`Using site inventory cache (${bulkRows.length} URLs)`, 100);
    console.log(`[Site Cache] Seeded from bulk generation inventory for site ${siteId}: ${bulkRows.length} rows`);
    return seedSiteCacheFromBulkInventory(site, bulkRows);
  }

  onProgress?.('Scraping site for internal links...', 0);
  console.log(`[Site Cache] Creating cache for site ${siteId} (postType: ${postType || 'all'})`);

  const allPosts: CachedPost[] = [];
  const normalizedUrl = site.siteUrl.replace(/\/$/, '');

  try {
    // Intelligent scraping strategy based on post type
    if (postType === 'service-area') {
      // For service areas: prioritize service-area content
      onProgress?.('Fetching service-area posts...', 10);
      
      // 1. Fetch all service-area posts
      try {
        let serviceAreaOffset = 0;
        let hasMoreServiceAreas = true;
        const serviceAreaBatchSize = 100;

        while (hasMoreServiceAreas) {
          const serviceAreaResult = await getPublishedServiceAreas(
            site.siteUrl,
            site.username,
            site.appPassword,
            serviceAreaBatchSize,
            serviceAreaOffset
          );

          if (serviceAreaResult.posts && serviceAreaResult.posts.length > 0) {
            const serviceAreaPosts = serviceAreaResult.posts.map((p) => ({
              id: p.id,
              slug: p.slug || '',
              title: p.title || '',
              excerpt: (p.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 200),
              link: p.link || `${normalizedUrl}/${p.slug || `service-area-${p.id}`}`,
              date_gmt: p.date_gmt || '',
              postType: 'service-area' as const
            }));

            allPosts.push(...serviceAreaPosts);
            serviceAreaOffset += serviceAreaBatchSize;
            onProgress?.(`Fetched ${allPosts.length} service-area posts...`, 20);

            // Check if there are more
            if (serviceAreaResult.count <= allPosts.length || serviceAreaResult.posts.length < serviceAreaBatchSize) {
              hasMoreServiceAreas = false;
            }
          } else {
            hasMoreServiceAreas = false;
          }
        }
      } catch (error) {
        console.warn('[Site Cache] Error fetching service-area posts:', error);
      }

      // 2. Then fetch regular posts
      onProgress?.('Fetching regular posts...', 40);
      await fetchAllPosts(site, allPosts, normalizedUrl, onProgress, 40, 30);

      // 3. Then fetch pages
      onProgress?.('Fetching pages...', 70);
      await fetchAllPages(site, allPosts, normalizedUrl, onProgress, 70, 10);

      // 4. Then fetch sitemap URLs (prioritize service-area sitemap)
      onProgress?.('Fetching sitemap URLs...', 80);
      await fetchSitemapUrls(site, allPosts, normalizedUrl, onProgress, 80, 15, true);

    } else {
      // For regular posts: prioritize posts, then pages, then sitemap
      // 1. Fetch all posts
      onProgress?.('Fetching posts...', 10);
      await fetchAllPosts(site, allPosts, normalizedUrl, onProgress, 10, 40);

      // 2. Fetch all pages
      onProgress?.('Fetching pages...', 50);
      await fetchAllPages(site, allPosts, normalizedUrl, onProgress, 50, 20);

      // 3. Fetch sitemap URLs
      onProgress?.('Fetching sitemap URLs...', 70);
      await fetchSitemapUrls(site, allPosts, normalizedUrl, onProgress, 70, 25);
    }

    // Remove duplicates based on link
    const uniquePosts = Array.from(
      new Map(allPosts.map(item => [item.link.toLowerCase(), item])).values()
    );

    const { titleIndex, urlIndex } = buildSearchIndexes(uniquePosts);

    const cache: SiteContentCache = {
      siteId,
      siteUrl: site.siteUrl,
      posts: uniquePosts,
      createdAt: Date.now(),
      titleIndex,
      urlIndex
    };

    siteCache.set(siteId, cache);
    onProgress?.(`Cache created: ${uniquePosts.length} unique posts/pages`, 100);
    console.log(`[Site Cache] Created cache for site ${siteId}: ${uniquePosts.length} posts`);

    return cache;
  } catch (error) {
    console.error('[Site Cache] Error creating cache:', error);
    throw error;
  }
}

/**
 * Fetches all posts in batches
 */
async function fetchAllPosts(
  site: WordPressSite,
  allPosts: CachedPost[],
  normalizedUrl: string,
  onProgress?: (message: string, progress?: number) => void,
  startProgress: number = 0,
  progressRange: number = 40
): Promise<void> {
  try {
    let offset = 0;
    let hasMore = true;
    const batchSize = 100;
    let totalFetched = 0;

    while (hasMore) {
      const publishedResult = await getPublishedPosts(
        site.siteUrl,
        site.username,
        site.appPassword,
        batchSize,
        offset
      );

      if (publishedResult.posts && publishedResult.posts.length > 0) {
        const postsMetadata = publishedResult.posts.map((p) => ({
          id: p.id,
          slug: p.slug || '',
          title: p.title || '',
          excerpt: (p.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 200),
          link: p.link || `${normalizedUrl}/${p.slug || `post-${p.id}`}`,
          date_gmt: p.date_gmt || '',
          postType: 'post' as const
        }));

        allPosts.push(...postsMetadata);
        totalFetched += postsMetadata.length;
        offset += batchSize;

        const progress = startProgress + Math.min((totalFetched / Math.max(publishedResult.count || totalFetched, 1)) * progressRange, progressRange);
        onProgress?.(`Fetched ${totalFetched} posts...`, progress);

        // Check if there are more
        if (publishedResult.count <= totalFetched || postsMetadata.length < batchSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.warn('[Site Cache] Error fetching posts:', error);
  }
}

/**
 * Fetches all pages in batches
 */
async function fetchAllPages(
  site: WordPressSite,
  allPosts: CachedPost[],
  normalizedUrl: string,
  onProgress?: (message: string, progress?: number) => void,
  startProgress: number = 0,
  progressRange: number = 20
): Promise<void> {
  try {
    const inventory = await getSitePageInventory(site.siteUrl, site.username, site.appPassword);
    const rows = inventory.posts ?? [];
    if (rows.length > 0) {
      const pagesMetadata = rows.map((p) => ({
        id: p.id ?? 0,
        slug: p.slug || '',
        title: p.fields?.title || '',
        excerpt: (p.fields?.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 200),
        link: p.url || `${normalizedUrl}/${p.slug || `page-${p.id}`}`,
        date_gmt: p.date_gmt || '',
        postType: 'page' as const
      }));

      allPosts.push(...pagesMetadata);
      onProgress?.(`Fetched ${pagesMetadata.length} pages...`, startProgress + progressRange);
    }
  } catch (error) {
    console.warn('[Site Cache] Error fetching pages:', error);
  }
}

/**
 * Fetches URLs from sitemap(s)
 */
async function fetchSitemapUrls(
  site: WordPressSite,
  allPosts: CachedPost[],
  normalizedUrl: string,
  onProgress?: (message: string, progress?: number) => void,
  startProgress: number = 0,
  progressRange: number = 20,
  prioritizeServiceArea: boolean = false
): Promise<void> {
  try {
    let sitemapUrl: string | null = null;

    // Use existing sitemap if detected
    if (site.sitemaps?.mainSitemapUrl) {
      sitemapUrl = site.sitemaps.mainSitemapUrl;
    } else {
      // Try to detect sitemap
      const sitemapDetection = await detectSitemaps(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      if (sitemapDetection.found && sitemapDetection.sitemapUrl) {
        sitemapUrl = sitemapDetection.sitemapUrl;
      }
    }

    if (sitemapUrl) {
      const existingLinks = new Set(allPosts.map(c => c.link.toLowerCase()));

      // Parse main sitemap
      const sitemapResult = await parseSitemap(
        site.siteUrl,
        sitemapUrl,
        site.username,
        site.appPassword
      );

      if (sitemapResult.urls && sitemapResult.urls.length > 0) {
        const sitemapContent = sitemapResult.urls
          .map((url: string) => {
            try {
              const urlObj = new URL(url);
              const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
              const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';

              return {
                id: 0, // Sitemap URLs don't have IDs
                slug: slug,
                title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || url,
                excerpt: '',
                link: url,
                date_gmt: ''
              };
            } catch {
              return null;
            }
          })
          .filter((item): item is CachedPost =>
            item !== null && !existingLinks.has(item.link.toLowerCase())
          );

        allPosts.push(...sitemapContent);
        onProgress?.(`Added ${sitemapContent.length} URLs from main sitemap`, startProgress + progressRange * 0.5);
      }

      // Process child sitemaps (prioritize service-area if requested)
      if (sitemapResult.childSitemaps && sitemapResult.childSitemaps.length > 0) {
        // Sort child sitemaps: service-area first if prioritizing
        const sortedChildSitemaps = prioritizeServiceArea
          ? [...sitemapResult.childSitemaps].sort((a, b) => {
              const aIsServiceArea = a.toLowerCase().includes('service-area') || a.toLowerCase().includes('service_area');
              const bIsServiceArea = b.toLowerCase().includes('service-area') || b.toLowerCase().includes('service_area');
              if (aIsServiceArea && !bIsServiceArea) return -1;
              if (!aIsServiceArea && bIsServiceArea) return 1;
              return 0;
            })
          : sitemapResult.childSitemaps;

        // Process all child sitemaps in parallel batches
        const batchSize = 5;
        for (let i = 0; i < sortedChildSitemaps.length; i += batchSize) {
          const batch = sortedChildSitemaps.slice(i, i + batchSize);
          const batchPromises = batch.map(async (childSitemapUrl) => {
            try {
              const childResult = await parseSitemap(
                site.siteUrl,
                childSitemapUrl,
                site.username,
                site.appPassword
              );

              if (childResult.urls && childResult.urls.length > 0) {
                const existingLinks = new Set(allPosts.map(c => c.link.toLowerCase()));
                const childContent = childResult.urls
                  .map((url: string) => {
                    try {
                      const urlObj = new URL(url);
                      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
                      const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';

                      return {
                        id: 0,
                        slug: slug,
                        title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || url,
                        excerpt: '',
                        link: url,
                        date_gmt: ''
                      };
                    } catch {
                      return null;
                    }
                  })
                  .filter((item): item is CachedPost =>
                    item !== null && !existingLinks.has(item.link.toLowerCase())
                  );

                return childContent;
              }
              return [];
            } catch (error) {
              console.warn(`[Site Cache] Could not parse child sitemap ${childSitemapUrl}:`, error);
              return [];
            }
          });

          const batchResults = await Promise.all(batchPromises);
          const flatResults = batchResults.flat();
          allPosts.push(...flatResults);

          const progress = startProgress + Math.min(((i + batch.length) / sortedChildSitemaps.length) * progressRange, progressRange);
          onProgress?.(`Processed ${Math.min(i + batch.length, sortedChildSitemaps.length)}/${sortedChildSitemaps.length} child sitemaps...`, progress);
        }
      }
    }
  } catch (error) {
    console.warn('[Site Cache] Error processing sitemap:', error);
  }
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
    console.log(`[Site Cache] Cleared cache for site ${siteId} (${cache.posts.length} posts)`);
  }
}

/**
 * Clears all caches
 */
export function clearAllCaches(): void {
  const count = siteCache.size;
  siteCache.clear();
  console.log(`[Site Cache] Cleared all caches (${count} sites)`);
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
