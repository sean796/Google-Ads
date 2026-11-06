import { useState, useEffect, useCallback } from "react";
import { getPublishedPosts, type PublishedPostsResult, parseSitemap } from "@/lib/wordpress-api";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { logger } from "@/lib/logger";
import { type WordPressSite } from "../types";

export function useServiceAreaData(site: WordPressSite) {
  const [open, setOpen] = useState(false);
  const [serviceAreas, setServiceAreas] = useState<PublishedPostsResult['posts']>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get entity sitemap URL (entity sitemap pattern - use entitySitemapUrl from site)
  const getEntitySitemapUrl = useCallback((): string | null => {
    // Use entitySitemapUrl from site if available (entity sitemap pattern)
    if (site.entitySitemapUrl) {
      return site.entitySitemapUrl;
    }
    // Fallback: try to find in child sitemaps (for backward compatibility)
    if (site.sitemaps?.childSitemaps) {
      // Look for any entity sitemap (not hardcoded to service-area)
      return site.sitemaps.childSitemaps.find(url => 
        url.toLowerCase().includes('-sitemap.xml') || 
        url.toLowerCase().includes('_sitemap.xml')
      ) || null;
    }
    return null;
  }, [site.entitySitemapUrl, site.sitemaps]);

  const fetchServiceAreas = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      return;
    }

    setIsLoading(true);
    try {
      // First try to parse entity sitemap for instant results (entity sitemap pattern)
      const sitemapUrl = getEntitySitemapUrl();
      if (sitemapUrl) {
        try {
          const parseResult = await parseSitemap(
            site.siteUrl,
            sitemapUrl,
            site.username,
            site.appPassword
          );
          
          if (parseResult.urls && parseResult.urls.length > 0) {
            // Convert URLs to service area format
            const serviceAreasFromSitemap: PublishedPostsResult['posts'] = parseResult.urls.map((url, index) => {
              try {
                const urlObj = new URL(url);
                const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
                const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
                
                // Extract title from slug (convert kebab-case to Title Case)
                const title = slug
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ') || url;
                
                return {
                  id: index + 1, // Temporary ID
                  slug: slug,
                  title: title,
                  date_gmt: '',
                  excerpt: '',
                  link: url
                };
              } catch {
                return {
                  id: index + 1,
                  slug: '',
                  title: url,
                  date_gmt: '',
                  excerpt: '',
                  link: url
                };
              }
            });
            
            setServiceAreas(serviceAreasFromSitemap);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          logger.warn('[ServiceAreaSelector] Error parsing sitemap, falling back to API:', error);
        }
      }
      
      // Fallback to API if sitemap parsing fails
      // Use entity endpoint extraction pattern (Content Optimizer module approach)
      const entitySitemapUrl = getEntitySitemapUrl();
      const entityEndpoint = entitySitemapUrl 
        ? extractEndpointFromEntitySitemapUrl(entitySitemapUrl)
        : null;
      
      // Use getPublishedPosts with entity endpoint (if available) or default to 'posts'
      // Note: getPublishedPosts doesn't currently support endpoint parameter, 
      // so this uses the backend endpoint extraction logic
      const result = await getPublishedPosts(
        site.siteUrl, 
        site.username, 
        site.appPassword, 
        100, 
        0
      );
      if (result.error) {
        // Handle "no service areas" case gracefully - don't show error toast
        if (result.error.includes('No published service areas found')) {
          setServiceAreas([]);
          return;
        }
        throw new Error(result.error);
      }
      setServiceAreas(result.posts || []);
    } catch (error) {
      // Only log error, don't show toast - this is not critical
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('No published service areas found')) {
        logger.warn('[ServiceAreaSelector] Error fetching service areas:', errorMessage);
      }
      setServiceAreas([]);
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword, getEntitySitemapUrl]);

  // Only fetch service areas when popover opens (lazy loading) - same as posts
  useEffect(() => {
    if (open && site.username && site.appPassword && serviceAreas.length === 0 && !isLoading) {
      fetchServiceAreas();
    }
  }, [open, site.username, site.appPassword, fetchServiceAreas, serviceAreas.length, isLoading]);

  return { open, setOpen, serviceAreas, isLoading, searchQuery, setSearchQuery, getEntitySitemapUrl, fetchServiceAreas };
}
