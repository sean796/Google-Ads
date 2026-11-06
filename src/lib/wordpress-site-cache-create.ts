import { logger } from "@/lib/logger";
import type { WordPressSite } from '@/components/integrations/types';
import { getPublishedServiceAreas } from './wordpress-api';
import { getBulkGenerationWpInventoryIfReady } from './bulk/bulk-generation-wp-inventory';
import { buildSearchIndexes } from './wordpress-site-cache-types';
import type { CachedPost, SiteContentCache } from './wordpress-site-cache-types';
import { seedSiteCacheFromBulkInventory, siteCache } from './wordpress-site-cache-store';
import { fetchAllPages, fetchAllPosts, fetchSitemapUrls } from './wordpress-site-cache-fetchers';

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
    return existingCache;
  }

  const bulkRows = getBulkGenerationWpInventoryIfReady(siteId);
  if (bulkRows?.length) {
    onProgress?.(`Using site inventory cache (${bulkRows.length} URLs)`, 100);
    return seedSiteCacheFromBulkInventory(site, bulkRows);
  }

  onProgress?.('Scraping site for internal links...', 0);

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
        logger.warn('[Site Cache] Error fetching service-area posts:', error);
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

    return cache;
  } catch (error) {
    logger.error('[Site Cache] Error creating cache:', error);
    throw error;
  }
}
