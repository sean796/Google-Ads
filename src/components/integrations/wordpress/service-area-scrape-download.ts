import { resolveWordPressUrls, getWordPressPostContent } from "@/lib/wordpress-api";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_SERVICE_AREA_DATA, NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE, notifyDownloadedXServiceAreaSAsJson } from "@/lib/notify-messages";

export async function downloadServiceAreasAsJson({
  site,
  selectedUrls,
  getEntitySitemapUrl,
}: {
  site: WordPressSite;
  selectedUrls: string[];
  getEntitySitemapUrl: () => string | null;
}): Promise<void> {
if (!site.username || !site.appPassword) {
                notify.error(NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE);
                return;
              }

              try {
                notify.info(NOTIFY_FETCHING_SERVICE_AREA_DATA);
                
                // Helper function to convert subtype to endpoint (same as in use-content-optimization.ts)
                const subtypeToEndpoint = (subtype?: string): string | undefined => {
                  const map: Record<string, string> = {
                    post: 'posts',
                    page: 'pages', // Hard rule: pages always use 'pages'
                  };
                  // For custom subtypes, try entity endpoint extraction if available
                  if (subtype && !map[subtype]) {
                    const entitySitemapUrl = getEntitySitemapUrl();
                    if (entitySitemapUrl) {
                      return extractEndpointFromEntitySitemapUrl(entitySitemapUrl);
                    }
                  }
                  return subtype ? map[subtype] : undefined;
                };

                // Helper to find endpoint from sitemap by matching URL to sitemap URLs
                const findEndpointFromSitemap = (url: string, site: WordPressSite): string | undefined => {
                  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
                    return undefined;
                  }

                  const urlPath = new URL(url).pathname.toLowerCase();

                  // Check each sitemap's endpoint
                  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
                    // Extract sitemap type from filename (e.g., "post-sitemap.xml" -> "post")
                    const sitemapFilename = sitemapUrl.split('/').pop() || '';
                    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '').toLowerCase();
                    
                    // Match URL path to sitemap type
                    // e.g., /page/about -> page-sitemap.xml -> 'pages'
                    // e.g., /entity-slug/denver -> entity-slug-sitemap.xml -> 'entity-slugs'
                    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
                      console.log(`[ServiceAreaSelector Scrape] Matched URL to sitemap: ${url} -> ${sitemapUrl} -> endpoint: ${endpoint}`);
                      return endpoint;
                    }
                  }

                  // Hard rule: if URL contains /page/ or looks like a page, use 'pages'
                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^/]+$/)) {
                    // Check if it's NOT a post (posts usually have dates in path)
                    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
                      console.log(`[ServiceAreaSelector Scrape] Hard rule: URL looks like a page, using 'pages' endpoint`);
                      return 'pages';
                    }
                  }

                  return undefined;
                };

                // Determine endpoint using same priority as handleOptimizeContent:
                // 1. Manual endpoint (authoritative)
                // 2. Subtype to endpoint mapping (with hard rules)
                // 3. Sitemap detection (match URL to sitemap)
                let knownEndpoint = site.manualEndpoint;
                
                // If no endpoint yet, try to find it from sitemap detection (check first URL)
                if (!knownEndpoint && selectedUrls.length > 0) {
                  knownEndpoint = findEndpointFromSitemap(selectedUrls[0], site);
                }

                const entitySitemapUrl = site.entitySitemapUrl || undefined;
// Resolve URLs to get post IDs and types - NOW USING ENTITY LOGIC
                const resolveResult = await resolveWordPressUrls(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  selectedUrls,
                  entitySitemapUrl,  // Pass entity sitemap URL
                  knownEndpoint      // Pass known endpoint from manual, subtype, or sitemap detection
                );
if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
const errorMsg = resolveResult.unresolvable?.[0]?.reason || 'Could not resolve service area URLs';
                  notify.error(errorMsg);
                  return;
                }
// Fetch full service area content with all fields
                const contentResult = await getWordPressPostContent(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  undefined,
                  undefined,
                  resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }))
                );
if (contentResult.error || !contentResult.posts || contentResult.posts.length === 0) {
notify.error(contentResult.error || 'Failed to fetch service area data');
                  return;
                }

                // Create JSON file with all service area data
                const jsonData = {
                  siteUrl: site.siteUrl,
                  siteName: site.name,
                  fetchedAt: new Date().toISOString(),
                  serviceAreas: contentResult.posts.map(post => ({
                    ...post.fullData || post, // Include fullData if available, otherwise use post
                    // Also include parsed fields for convenience
                    parsed: {
                      id: post.id,
                      slug: post.slug,
                      title: post.title,
                      link: post.link,
                      status: post.status,
                      date_gmt: post.date_gmt,
                      postTypeEndpoint: post.postTypeEndpoint,
                      postTypeSubtype: post.postTypeSubtype,
                    }
                  }))
                };

                // Download JSON file
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `wordpress-service-areas-${site.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                notify.success(notifyDownloadedXServiceAreaSAsJson(contentResult.posts.length));
              } catch (error) {
console.error('[ServiceAreaSelector] Error scraping service areas:', error);
                notify.error(error instanceof Error ? error.message : 'Failed to scrape service areas');
              }
}
