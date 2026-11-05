import React, { useState, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublishedPosts, type PublishedPostsResult, resolveWordPressUrls, getWordPressPostContent, parseSitemap } from "@/lib/wordpress-api";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_SERVICE_AREA_DATA, NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE, notifyDownloadedXServiceAreaSAsJson } from "@/lib/notify-messages";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { Button, Field } from "@/ui";

interface ServiceAreaSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void; // Callback to pass post data when selected
}

export const ServiceAreaSelector: React.FC<ServiceAreaSelectorProps> = ({
  site,
  value,
  onValueChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
}) => {
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
          console.warn('[ServiceAreaSelector] Error parsing sitemap, falling back to API:', error);
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
          console.log('[ServiceAreaSelector] No published service areas found - this is normal if the site has no service areas yet');
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
        console.warn('[ServiceAreaSelector] Error fetching service areas:', errorMessage);
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

  const selectedUrls = multiSelect ? (Array.isArray(value) ? value : []) : [];
  const selectedUrl = multiSelect ? undefined : (typeof value === 'string' ? value : '');
  const selectedServiceArea = serviceAreas.find((serviceArea) => serviceArea.link === selectedUrl);
  const selectedServiceAreas = multiSelect ? serviceAreas.filter((serviceArea) => selectedUrls.includes(serviceArea.link)) : [];

  const filteredServiceAreas = serviceAreas.filter((serviceArea) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      serviceArea.title.toLowerCase().includes(query) ||
      serviceArea.link.toLowerCase().includes(query) ||
      serviceArea.slug.toLowerCase().includes(query)
    );
  });

  const filteredSelectedUrls = filteredServiceAreas.map((serviceArea) => serviceArea.link);
  const allFilteredSelected = filteredSelectedUrls.length > 0 && filteredSelectedUrls.every((url) => selectedUrls.includes(url));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newUrls = Array.from(new Set([...selectedUrls, ...filteredSelectedUrls]));
      onValueChange(newUrls);
    } else {
      const newUrls = selectedUrls.filter((url) => !filteredSelectedUrls.includes(url));
      onValueChange(newUrls);
    }
  };

  const handleToggleServiceArea = (serviceAreaUrl: string) => {
    if (selectedUrls.includes(serviceAreaUrl)) {
      onValueChange(selectedUrls.filter((url) => url !== serviceAreaUrl));
    } else {
      onValueChange([...selectedUrls, serviceAreaUrl]);
    }
  };

  return (
    <div className="space-y-2">
      <style>{`
        [data-radix-popover-content] [cmdk-item][data-selected="true"],
        [data-radix-popover-content] [cmdk-item][data-selected="true"] * {
          background-color: black !important;
          color: white !important;
        }
        [data-radix-popover-content] [cmdk-item]:hover,
        [data-radix-popover-content] [cmdk-item]:hover * {
          background-color: black !important;
          color: white !important;
        }
      `}</style>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
          >
            <span className="break-words">
              {multiSelect ? (
                selectedServiceAreas.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    {selectedServiceAreas.length === 1 ? (
                      selectedServiceAreas[0].link
                    ) : (
                      `${selectedServiceAreas.length} service areas selected`
                    )}
                  </span>
                ) : (
                  "Select service areas..."
                )
              ) : selectedServiceArea ? (
                <span className="flex items-center gap-2">
                  <FileText className="h-3 w-3 shrink-0" />
                  {selectedServiceArea.link}
                </span>
              ) : selectedUrl ? (
                selectedUrl
              ) : (
                "Select or enter service area URL..."
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1.5rem,var(--radix-popover-content-available-width))] border border-primary/30 bg-[#050505] p-0"
          align="start"
        >
          <Command className="bg-[#050505]">
            <CommandInput
              placeholder="Search service areas..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-[#050505] border-0 border-b-0 text-primary placeholder:text-muted-foreground font-medium"
            />
            <div className={`flex items-center justify-between px-3 py-2 text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
              <span>{filteredServiceAreas.length} service area{filteredServiceAreas.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="quiet"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fetchServiceAreas();
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  null
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            </div>
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-primary font-medium">
                    
                    Loading service areas...
                  </div>
                ) : (
                  <span className="text-foreground font-medium">No service areas found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {multiSelect && filteredServiceAreas.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black hover:text-white transition-colors group"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectAll(!allFilteredSelected);
                    }}
                  >
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={handleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 border-primary/50 data-[state=checked]:bg-primary/30 data-[state=checked]:border-primary"
                    />
                    <span className={cn(
                      "text-sm font-semibold",
                      allFilteredSelected ? "text-white" : "text-primary group-hover:text-white"
                    )}>Select All ({filteredServiceAreas.length})</span>
                  </div>
                )}
                {filteredServiceAreas.map((serviceArea) => {
                  const isSelected = multiSelect ? selectedUrls.includes(serviceArea.link) : selectedUrl === serviceArea.link;
                  return (
                    <CommandItem
                      key={serviceArea.id}
                      value={serviceArea.link}
                      onSelect={() => {
                        if (multiSelect) {
                          handleToggleServiceArea(serviceArea.link);
                        } else {
                          onValueChange(serviceArea.link);
                          
                          // Determine source: API items have date_gmt, sitemap items don't
                          const source = serviceArea.date_gmt ? 'api' : 'sitemap';
                          
                          if (source === 'sitemap') {
                            // Never treat sitemap items as resolved - always resolve URL
                            if (onPostDataChange) {
                              onPostDataChange(null);
                            }
                          } else if (source === 'api' && onPostDataChange) {
                            // API-loaded items have real WordPress IDs - pass full post data with endpoint
                            // Use entity endpoint extraction pattern (Content Optimizer module approach)
                            const entitySitemapUrl = getEntitySitemapUrl();
                            const entityEndpoint = entitySitemapUrl 
                              ? extractEndpointFromEntitySitemapUrl(entitySitemapUrl)
                              : 'posts';
                            onPostDataChange({
                              id: serviceArea.id,
                              subtype: entityEndpoint === 'posts' ? 'post' : entityEndpoint.replace(/s$/, ''),
                              link: serviceArea.link,
                              slug: serviceArea.slug,
                              endpoint: entityEndpoint,
                            });
                          }
                          
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex items-center py-2.5 px-3 rounded transition-colors group",
                        isSelected ? "bg-ui-field-hover/60 border border-primary/50" : "hover:bg-black hover:text-white border border-transparent",
                        "[&[data-selected='true']]:!bg-black [&[data-selected='true']]:!text-white"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleServiceArea(serviceArea.link)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 border-primary/50 data-[state=checked]:bg-primary/30 data-[state=checked]:border-primary"
                            />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected ? "opacity-100 text-white" : "opacity-0 text-primary"
                              )}
                            />
                          )}
                          <span className={cn(
                            "font-semibold text-sm break-words",
                            isSelected ? "text-white" : "text-primary group-hover:text-white"
                          )}>{serviceArea.title}</span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check className="h-4 w-4 text-white shrink-0" />
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Manual URL input as fallback - only show for single select */}
      {!multiSelect && (
        <div className="relative">
          <Field
            placeholder="Or enter URL manually"
            value={selectedUrl || ''}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
          />
          {selectedServiceArea && (
            <Button
              variant="quiet"
              onClick={() => window.open(selectedServiceArea.link, '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedServiceAreas.length > 0 && (
        <div className={`flex items-center justify-between text-xs ${getCyberpunkTextClasses('muted')}`}>
          <span>
            {selectedServiceAreas.length} service area{selectedServiceAreas.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="quiet"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
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
                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^\/]+$/)) {
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
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            title="Download service area data as JSON"
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

