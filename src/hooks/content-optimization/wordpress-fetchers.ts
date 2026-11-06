import { logger } from "@/lib/logger";
import { getPublishedPosts, getPublishedPages, parseSitemap } from "@/lib/wordpress-api";
import { type WordPressSite } from "@/components/integrations/types";

/**
 * Fetch all post URLs for a WordPress site
 * Uses the WordPress REST API to fetch published posts
 */
export async function fetchAllPostsForSite(site: WordPressSite): Promise<string[]> {
  const urls: string[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, limit, offset);
      if (result.error) {
        if (result.error.includes('No published posts found')) {
          break;
        }
        throw new Error(result.error);
      }
      
      if (result.posts && result.posts.length > 0) {
        result.posts.forEach(post => {
          if (post.link) {
            urls.push(post.link);
          }
        });
        
        if (result.posts.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      } else {
        hasMore = false;
      }
    } catch (error) {
      logger.error(`[WordPress fetch] Error fetching posts for site ${site.name}:`, error);
      hasMore = false;
    }
  }

  return urls;
}

/** Fetch ALL page URLs for a WordPress site. Keeps requesting until no more. */
export async function fetchAllPagesForSite(site: WordPressSite): Promise<string[]> {
  const urls: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const result = await getPublishedPages(site.siteUrl, site.username!, site.appPassword!, perPage, (page - 1) * perPage);
    if (result.error) break;
    if (!result.posts?.length) break;
    result.posts.forEach((p: { link?: string }) => { if (p.link) urls.push(p.link); });
    if (result.posts.length < perPage) break;
    page++;
  }

  return urls;
}

/**
 * Fetch all service area URLs for a WordPress site
 * Uses entity sitemap URL or child sitemaps to find service areas
 */
export async function fetchAllServiceAreasForSite(site: WordPressSite): Promise<string[]> {
  const urls: string[] = [];
  
  try {
    // First try to use entity sitemap URL if available
    let sitemapUrl = site.entitySitemapUrl;
    
    // If no entity sitemap, try to find service-area sitemap from child sitemaps
    if (!sitemapUrl && site.sitemaps?.childSitemaps) {
      sitemapUrl = site.sitemaps.childSitemaps.find(url => 
        url.toLowerCase().includes('service-area') || 
        url.toLowerCase().includes('service_area')
      ) || null;
    }
    
    if (sitemapUrl) {
      const parseResult = await parseSitemap(
        site.siteUrl,
        sitemapUrl,
        site.username,
        site.appPassword
      );
      
      if (parseResult.urls && parseResult.urls.length > 0) {
        urls.push(...parseResult.urls);
      }
    } else {
      // Fallback: try to fetch via API if endpoint is known
      const endpoints: Record<string, string> = site.sitemaps?.endpoints || {};
      const endpointKeys = Object.keys(endpoints);
      const endpoint = site.manualEndpoint || (endpointKeys.length > 0 ? endpoints[endpointKeys[0]] : 'service-areas');
      if (endpoint === 'service-areas' || endpoint.includes('service')) {
        // Try to get service areas via API (similar to posts)
        const offset = 0;
        const limit = 100;
        let hasMore = true;
        
        while (hasMore) {
          try {
            // Use getPublishedPosts with a custom endpoint if available
            // For now, we'll rely on sitemap parsing
            hasMore = false;
          } catch (error) {
            logger.warn(`[WordPress fetch] Could not fetch service areas via API for ${site.name}`);
            hasMore = false;
          }
        }
      }
    }
  } catch (error) {
    logger.error(`[WordPress fetch] Error fetching service areas for site ${site.name}:`, error);
  }

  return urls;
}
