import type { WordPressSite } from '@/components/integrations/types';
import {
  getPublishedPosts,
  getSitePageInventory,
  parseSitemap,
  detectSitemaps
} from './wordpress-api';
import type { CachedPost } from './wordpress-site-cache-types';

/**
 * Fetches all posts in batches
 */
export async function fetchAllPosts(
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
export async function fetchAllPages(
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
export async function fetchSitemapUrls(
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
