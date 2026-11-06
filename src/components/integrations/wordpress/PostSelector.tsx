import React, { useState, useEffect, useCallback } from "react";



import { RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublishedPosts, type PublishedPostsResult, resolveWordPressUrls, getWordPressPostContent } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_POST_DATA, NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE, notifyDownloadedXPostSAsJson } from "@/lib/notify-messages";
import { Button, Field, Popover, PopoverContent, PopoverTrigger, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, Checkbox } from "@/ui";
import { logger } from "@/lib/logger";

interface PostSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void; // Callback to pass post data when selected
}

export const PostSelector: React.FC<PostSelectorProps> = ({
  site,
  value,
  onValueChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
}) => {
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<PublishedPostsResult['posts']>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPosts = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
      if (result.error) {
        // Handle "no posts" case gracefully - don't show error toast
        if (result.error.includes('No published posts found')) {
          setPosts([]);
          return;
        }
        throw new Error(result.error);
      }
      setPosts(result.posts || []);
    } catch (error) {
      // Only log error, don't show toast - this is not critical
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('No published posts found')) {
        logger.warn('[PostSelector] Error fetching posts:', errorMessage);
      }
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword]);

  // Only fetch posts when popover opens (lazy loading)
  useEffect(() => {
    if (open && site.username && site.appPassword && posts.length === 0 && !isLoading) {
      fetchPosts();
    }
  }, [open, site.username, site.appPassword, fetchPosts, posts.length, isLoading]);

  const selectedUrls = multiSelect ? (Array.isArray(value) ? value : []) : [];
  const selectedUrl = multiSelect ? undefined : (typeof value === 'string' ? value : '');
  const selectedPost = posts.find((post) => post.link === selectedUrl);
  const selectedPosts = multiSelect ? posts.filter((post) => selectedUrls.includes(post.link)) : [];

  const filteredPosts = posts.filter((post) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      post.title.toLowerCase().includes(query) ||
      post.link.toLowerCase().includes(query) ||
      post.slug.toLowerCase().includes(query)
    );
  });

  const filteredSelectedUrls = filteredPosts.map((post) => post.link);
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

  const handleTogglePost = (postUrl: string) => {
    if (selectedUrls.includes(postUrl)) {
      onValueChange(selectedUrls.filter((url) => url !== postUrl));
    } else {
      onValueChange([...selectedUrls, postUrl]);
    }
  };

  return (
    <div className="space-y-2">
      <style>{`
        [data-radix-popover-content] [cmdk-item][data-selected] {
          background-color: #141414 !important;
          color: #f4f4f5 !important;
        }
        [data-radix-popover-content] [cmdk-item][data-selected] * {
          color: #e4e4e7 !important;
        }
        [data-radix-popover-content] [cmdk-item]:hover:not([data-selected]),
        [data-radix-popover-content] [cmdk-item]:hover:not([data-selected]) * {
          background-color: #0a0a0a !important;
          color: #fafafa !important;
        }
        [data-radix-popover-content] [cmdk-item][data-selected] .endpoint-badge {
          color: #e4e4e7 !important;
          background-color: #27272a !important;
          border-color: #52525b !important;
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
                selectedPosts.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    {selectedPosts.length === 1 ? (
                      selectedPosts[0].link
                    ) : (
                      `${selectedPosts.length} posts selected`
                    )}
                  </span>
                ) : (
                  "Select posts..."
                )
              ) : selectedPost ? (
                <span className="flex items-center gap-2">
                  <FileText className="h-3 w-3 shrink-0" />
                  {selectedPost.link}
                </span>
              ) : selectedUrl ? (
                selectedUrl
              ) : (
                "Select or enter post URL..."
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1.5rem,var(--radix-popover-content-available-width))] border border-border bg-[#0a0a0a] p-0"
          align="start"
        >
          <Command className="bg-[#0a0a0a]">
            <CommandInput
              placeholder="Search posts..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="border-0 border-b-0 bg-[#0a0a0a] font-medium text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground">
              <span>{filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="quiet"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fetchPosts();
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
                  <div className="flex items-center justify-center py-6 font-medium text-foreground">
                    
                    Loading posts...
                  </div>
                ) : (
                  <span className="text-foreground font-medium">No posts found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {multiSelect && filteredPosts.length > 0 && (
                  <div
                    className="group flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-ui-field hover:text-foreground"
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
                      className="h-4 w-4 border-border data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover"
                    />
                    <span className={cn(
                      "text-sm font-semibold",
                      allFilteredSelected ? "text-foreground" : "text-foreground group-hover:text-foreground"
                    )}>Select All ({filteredPosts.length})</span>
                  </div>
                )}
                {filteredPosts.map((post) => {
                  const isSelected = multiSelect ? selectedUrls.includes(post.link) : selectedUrl === post.link;
                  return (
                    <CommandItem
                      key={post.id}
                      value={post.link}
                      onSelect={() => {
                        if (multiSelect) {
                          handleTogglePost(post.link);
                        } else {
                          onValueChange(post.link);
                          // Pass post data to parent when selected from dropdown
                          // Posts from API always have real IDs
                          if (onPostDataChange) {
                            onPostDataChange({
                              id: post.id,
                              subtype: 'post',
                              link: post.link,
                              slug: post.slug,
                              endpoint: 'posts', // REQUIRED - PostSelector only fetches posts
                            });
                          }
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex items-center py-2.5 px-3 rounded transition-colors group",
                        isSelected
                          ? "border border-border bg-ui-field-hover/80 text-foreground"
                          : "border border-transparent hover:bg-ui-field hover:text-foreground",
                        "[&[data-selected]]:!bg-[#141414] [&[data-selected]]:!text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleTogglePost(post.link)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 border-border data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover"
                            />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected ? "opacity-100 text-foreground" : "opacity-0 text-foreground"
                              )}
                            />
                          )}
                          <span className={cn(
                            "font-semibold text-sm break-words",
                            isSelected ? "text-foreground" : "text-foreground group-hover:text-foreground"
                          )}>{post.title}</span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check className="h-4 w-4 text-foreground shrink-0" />
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
          {selectedPost && (
            <Button
              variant="quiet"
              onClick={() => window.open(selectedPost.link, '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedPosts.length > 0 && (
        <div className="flex items-center justify-between text-xs text-foreground">
          <span>
            {selectedPosts.length} post{selectedPosts.length !== 1 ? 's' : ''} selected
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
                notify.info(NOTIFY_FETCHING_POST_DATA);
                
                // Helper function to convert subtype to endpoint (same as in use-content-optimization.ts)
                const subtypeToEndpoint = (subtype?: string): string | undefined => {
                  const map: Record<string, string> = {
                    post: 'posts',
                    page: 'pages', // Hard rule: pages always use 'pages'
                    'service-area': 'service-areas',
                  };
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
                    // e.g., /service-area/denver -> service-area-sitemap.xml -> 'service-areas'
                    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
                      return endpoint;
                    }
                  }

                  // Hard rule: if URL contains /page/ or looks like a page, use 'pages'
                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^/]+$/)) {
                    // Check if it's NOT a post (posts usually have dates in path)
                    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
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
const errorMsg = resolveResult.unresolvable?.[0]?.reason || 'Could not resolve post URLs';
                  notify.error(errorMsg);
                  return;
                }
// Fetch full post content with all fields
                const contentResult = await getWordPressPostContent(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  undefined,
                  undefined,
                  resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }))
                );
if (contentResult.error || !contentResult.posts || contentResult.posts.length === 0) {
notify.error(contentResult.error || 'Failed to fetch post data');
                  return;
                }

                // Create JSON file with all post data
                const jsonData = {
                  siteUrl: site.siteUrl,
                  siteName: site.name,
                  fetchedAt: new Date().toISOString(),
                  posts: contentResult.posts.map(post => ({
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
                a.download = `wordpress-posts-${site.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                notify.success(notifyDownloadedXPostSAsJson(contentResult.posts.length));
              } catch (error) {
logger.error('[PostSelector] Error scraping posts:', error);
                notify.error(error instanceof Error ? error.message : 'Failed to scrape posts');
              }
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            title="Download post data as JSON"
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

