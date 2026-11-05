import React, { useState, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublishedPosts, getPublishedPages, resolveWordPressUrls, getWordPressPostContent, parseSitemap } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_DATA, NOTIFY_NO_ENTITIES_FOUND_IN_ENTITY_SITEMAP, NOTIFY_NO_ENTITY_SITEMAP_CONFIGURED_PLEASE_SET_, NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE, NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD, notifyDownloadedXItemSAsJson, notifyFailedToFetchEntitiesX, notifyFailedToFetchPagesX, notifyFailedToFetchPostsX } from "@/lib/notify-messages";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { Button, Field } from "@/ui";

interface UnifiedContentSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  postType: 'post' | 'service-area' | 'page' | 'both';
  onPostTypeChange: (type: 'post' | 'service-area' | 'page' | 'both') => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void;
  /** `cyberpunk` matches Elementor / integrations; `default` matches manager Card theme */
  theme?: 'cyberpunk' | 'default';
}

export const UnifiedContentSelector: React.FC<UnifiedContentSelectorProps> = ({
  site,
  value,
  onValueChange,
  postType,
  onPostTypeChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
  theme = 'cyberpunk',
}) => {
  const isDefault = theme === 'default';
  /** Default theme: requested flat #090909 surfaces (replaces muted grey panels); 1rem min type */
  const d = isDefault
    ? {
        bg: "bg-[#090909]",
        bgHover: "hover:bg-[#0c0c0c]",
        bgStripe: "bg-[#090909]",
        rowHover: "hover:bg-[#0c0c0c]",
        chipOn: "border border-border bg-[#0c0c0c] text-foreground shadow-sm",
        chipOff:
          "border border-transparent text-muted-foreground hover:border-border/50 hover:bg-[#0c0c0c] hover:text-foreground",
        text: "text-base",
        /** Override cmdk CommandItem `data-[selected]:bg-muted` (theme grey ≠ #090909) */
        itemRow: "bg-[#090909] data-[selected]:!bg-[#090909] hover:!bg-[#0c0c0c]",
        itemRowOn: "bg-[#0c0c0c] data-[selected]:!bg-[#0c0c0c] hover:!bg-[#121212]",
      }
    : null;
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [serviceAreas, setServiceAreas] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [pages, setPages] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasNoPosts, setHasNoPosts] = useState(false);
  const [hasNoEntities, setHasNoEntities] = useState(false);
  const [hasNoPages, setHasNoPages] = useState(false);

  const selectedUrls = Array.isArray(value) ? value : (value ? [value] : []);
  const selectedUrl = Array.isArray(value) ? '' : value;

  const currentItems = postType === 'post' ? posts : postType === 'service-area' ? serviceAreas : postType === 'page' ? pages : [...posts, ...serviceAreas]; // 'both' only includes posts and entities, not pages
  const selectedItem = currentItems.find(item => item.link === selectedUrl);
  const selectedItems = currentItems.filter(item => selectedUrls.includes(item.link));

  const fetchPosts = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
setIsLoading(true);
    setHasNoPosts(false); // Reset flag when attempting to fetch
    const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
if (result.error) {
      // Handle "no posts" case gracefully - don't show error toast
      if (result.error.includes('No published posts found')) {
        console.log('[UnifiedContentSelector] No published posts found - this is normal if the site has no posts yet');
        setPosts([]);
        setHasNoPosts(true); // Mark that we've determined there are no posts
} else {
        notify.error(notifyFailedToFetchPostsX(result.error));
        setPosts([]);
        setHasNoPosts(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      setPosts(result.posts || []);
      setHasNoPosts(result.posts?.length === 0); // Set flag if no posts returned
}
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  const fetchEntities = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
    
    if (!site.entitySitemapUrl) {
      notify.error(NOTIFY_NO_ENTITY_SITEMAP_CONFIGURED_PLEASE_SET_);
      setServiceAreas([]);
      return;
    }

    setIsLoading(true);
    try {
      // Parse entity sitemap to get entity URLs
      const parseResult = await parseSitemap(
        site.siteUrl,
        site.entitySitemapUrl,
        site.username,
        site.appPassword
      );
      
      if (parseResult.urls && parseResult.urls.length > 0) {
        // Convert URLs to entity format
        const entitiesFromSitemap = parseResult.urls.map((url: string, index: number) => {
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
              link: url,
              date_gmt: new Date().toISOString(),
            };
          } catch {
            return {
              id: index + 1,
              slug: '',
              title: url,
              link: url,
              date_gmt: new Date().toISOString(),
            };
          }
        });
        
        setServiceAreas(entitiesFromSitemap);
        setHasNoEntities(false); // Reset flag when entities are found
      } else {
        setServiceAreas([]);
        setHasNoEntities(true); // Mark that we've determined there are no entities
        notify.error(NOTIFY_NO_ENTITIES_FOUND_IN_ENTITY_SITEMAP);
      }
    } catch (error) {
      console.error('[UnifiedContentSelector] Error fetching entities:', error);
      notify.error(notifyFailedToFetchEntitiesX(error instanceof Error ? error.message : 'Unknown error'));
      setServiceAreas([]);
      setHasNoEntities(true); // CRITICAL: Set flag to prevent infinite retries in useEffect
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword, site.entitySitemapUrl]);

  const fetchPages = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
    setIsLoading(true);
    setHasNoPages(false); // Reset flag when attempting to fetch
    const result = await getPublishedPages(site.siteUrl, site.username, site.appPassword, 100, 0);
    if (result.error) {
      // Handle "no pages" case gracefully - don't show error toast
      if (result.error.includes('No published') || result.error.includes('not found')) {
        console.log('[UnifiedContentSelector] No published pages found - this is normal if the site has no pages yet');
        setPages([]);
        setHasNoPages(true); // Mark that we've determined there are no pages
      } else {
        notify.error(notifyFailedToFetchPagesX(result.error));
        setPages([]);
        setHasNoPages(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      // Exclude thank-you pages (noindex) from selector - Content Optimizer module
      const allPages = result.posts || [];
      const isThankYouPage = (p: { slug?: string; link?: string; title?: string }) => {
        const slug = (p.slug || '').toLowerCase();
        const link = (p.link || '').toLowerCase();
        let path = '';
        try {
          if (p.link) path = new URL(p.link).pathname.toLowerCase();
        } catch {
          path = link;
        }
        const title = (p.title || '').toLowerCase();
        return slug.includes('thank-you') || path.includes('thank-you') || link.includes('thank-you') || title.includes('thank you');
      };
      const pagesFiltered = allPages.filter((p) => !isThankYouPage(p));
      setPages(pagesFiltered);
      setHasNoPages(pagesFiltered.length === 0);
    }
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  // Reset flags when site URL changes
  useEffect(() => {
    setHasNoPosts(false);
    setHasNoEntities(false);
    setHasNoPages(false);
    setPosts([]);
    setServiceAreas([]);
    setPages([]);
  }, [site.siteUrl]);

  useEffect(() => {
    // Don't fetch if we've already determined there are no posts/entities/pages
    if (open && postType === 'post' && posts.length === 0 && !isLoading && !hasNoPosts) {
      fetchPosts();
    } else if (open && postType === 'service-area' && serviceAreas.length === 0 && !isLoading && !hasNoEntities) {
      fetchEntities();
    } else if (open && postType === 'page' && pages.length === 0 && !isLoading && !hasNoPages) {
      fetchPages();
    } else if (open && postType === 'both') {
      // Fetch posts and entities if not already loaded (both does not include pages)
      if (posts.length === 0 && !isLoading && !hasNoPosts) {
        fetchPosts();
      }
      if (serviceAreas.length === 0 && !isLoading && !hasNoEntities && site.entitySitemapUrl) {
        fetchEntities();
      }
    }
  }, [open, postType, posts.length, serviceAreas.length, pages.length, isLoading, hasNoPosts, hasNoEntities, hasNoPages, fetchPosts, fetchEntities, fetchPages, site.entitySitemapUrl]);

  const filteredItems = currentItems.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedUrls.includes(item.link));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onValueChange([...new Set([...selectedUrls, ...filteredItems.map(p => p.link)])]);
    } else {
      onValueChange(selectedUrls.filter(url => !filteredItems.map(p => p.link).includes(url)));
    }
  };

  const handleToggleItem = (itemUrl: string) => {
    if (selectedUrls.includes(itemUrl)) {
      onValueChange(selectedUrls.filter(url => url !== itemUrl));
    } else {
      onValueChange([...selectedUrls, itemUrl]);
    }
  };

  const getDisplayText = () => {
    if (multiSelect) {
      if (selectedItems.length > 0) {
        const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'service areas' : postType === 'page' ? 'pages' : 'URLs';
        return selectedItems.length === 1 ? selectedItems[0].link : `${selectedItems.length} ${typeLabel} selected`;
      }
      const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'URLs';
      return `Select ${typeLabel}...`;
    }
    if (selectedItem) {
      return selectedItem.link;
    }
    if (selectedUrl) {
      return selectedUrl;
    }
    const typeLabel = postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'URL';
    return `Select or enter ${typeLabel}...`;
  };
return (
    <div className="space-y-2">
      {!isDefault ? (
      <style>{`
        /* cmdk sets data-selected as boolean → DOM is often data-selected="" not ="true"; match attribute presence */
        [cmdk-item][data-selected] {
          background-color: #141414 !important;
          color: #f4f4f5 !important;
        }
        [cmdk-item][data-selected] * {
          color: #e4e4e7 !important;
        }
        [cmdk-item]:hover:not([data-selected]),
        [cmdk-item]:hover:not([data-selected]) * {
          background-color: #0a0a0a !important;
          color: #fafafa !important;
        }
        [cmdk-item][data-selected] .endpoint-badge {
          color: #e4e4e7 !important;
          background-color: #27272a !important;
          border-color: #52525b !important;
        }
      `}</style>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
          >
            <span className="break-words flex items-center gap-2">
              <FileText className={cn("shrink-0", isDefault ? "h-4 w-4" : "h-3 w-3")} />
              {getDisplayText()}
            </span>
            <ChevronsUpDown className={cn("ml-2 shrink-0 opacity-50", isDefault ? "h-4 w-4" : "h-3 w-3")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1.5rem,var(--radix-popover-content-available-width))] p-0",
            isDefault
              ? cn("rounded-md border border-border text-foreground shadow-md", d!.bg)
              : "border border-border bg-[#0a0a0a]"
          )}
          align="start"
        >
          <Command className={isDefault ? cn(d!.bg, d!.text) : "bg-[#0a0a0a]"}>
            <div
              className={cn(
                "flex items-center gap-2 px-3",
                isDefault ? cn("border-b border-border py-3", d!.bgStripe, d!.text) : "border-b border-border bg-ui-field/90 py-2"
              )}
            >
              <span
                className={cn(
                  "font-semibold uppercase tracking-wider",
                  isDefault ? cn(d!.text, "text-muted-foreground") : "text-xs text-foreground"
                )}
              >
                Type:
              </span>
              <div className="flex gap-1 flex-1">
                <Button
                  variant="quiet"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'post') {
                      onPostTypeChange('post');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoPosts(false); // Reset flag when switching types
                    }
                  }}
                >
                  Posts
                </Button>
                <Button
                  variant="quiet"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'service-area') {
                      onPostTypeChange('service-area');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoEntities(false); // Reset flag when switching types
                    }
                  }}
                  disabled={!site.entitySitemapUrl}
                  title={!site.entitySitemapUrl ? "No entity sitemap configured" : ""}
                >
                  Entities
                </Button>
                <Button
                  variant="quiet"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'both') {
                      onPostTypeChange('both');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                    }
                  }}
                >
                  Both
                </Button>
                <div className="flex-1" /> {/* Spacer */}
                <Button
                  variant="quiet"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (postType !== 'page') {
                      onPostTypeChange('page');
                      onValueChange(multiSelect ? [] : '');
                      setSearchQuery('');
                      setHasNoPages(false); // Reset flag when switching types
                    }
                  }}
                >
                  Pages
                </Button>
              </div>
            </div>
            <CommandInput
              placeholder={`Search ${postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'posts and entities'}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              className={cn(
                "border-0 border-b-0 font-medium",
                isDefault
                  ? cn("bg-transparent text-base text-foreground placeholder:text-muted-foreground")
                  : "bg-[#0a0a0a] text-foreground placeholder:text-muted-foreground"
              )}
            />
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2 font-medium",
                isDefault
                  ? cn("border-b border-border text-base text-muted-foreground", d!.bg)
                  : "text-sm text-foreground"
              )}
            >
              <span>{filteredItems.length} {postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'item'}{filteredItems.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="quiet"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (postType === 'post') {
                    fetchPosts();
                  } else if (postType === 'service-area') {
                    fetchEntities();
                  } else if (postType === 'page') {
                    fetchPages();
                  } else if (postType === 'both') {
                    fetchPosts();
                    fetchEntities();
                    // 'both' does not include pages
                  }
                }}
                disabled={isLoading || (postType === 'post' && hasNoPosts) || (postType === 'service-area' && hasNoEntities) || (postType === 'page' && hasNoPages)}
              >
                {isLoading ? (
                  null
                ) : (
                  <RefreshCw className={isDefault ? "h-4 w-4" : "h-3 w-3"} />
                )}
              </Button>
            </div>
            <CommandList className={isDefault ? cn(d!.bg) : undefined}>
              <CommandEmpty>
                {isLoading ? (
                  <div
                    className={cn(
                      "flex items-center justify-center py-6 font-medium",
                      isDefault ? cn(d!.text, "text-muted-foreground") : "text-foreground"
                    )}
                  >
                    
                    Loading {postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'posts and entities'}...
                  </div>
                ) : (
                  <span
                    className={cn("font-medium", isDefault ? cn(d!.text, "text-muted-foreground") : "text-foreground")}
                  >
                    No {postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'items'} found.
                  </span>
                )}
              </CommandEmpty>
              <CommandGroup
                className={isDefault ? cn(d!.bg, "p-0 [&_[cmdk-group-heading]]:px-3") : undefined}
              >
                {multiSelect && filteredItems.length > 0 && (
                  <div
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 transition-colors",
                      isDefault
                        ? cn(
                            "border-b border-border/50 px-3 py-2 text-base",
                            d!.bg,
                            d!.rowHover
                          )
                        : "px-3 py-2.5 hover:bg-ui-field hover:text-foreground"
                    )}
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
                      className={cn("h-4 w-4", !isDefault && "border-border data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover")}
                    />
                    <span
                      className={cn(
                        "font-semibold",
                        isDefault
                          ? cn(
                              d!.text,
                              allFilteredSelected
                                ? "text-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                            )
                          : cn(
                              "text-sm",
                              allFilteredSelected
                                ? "text-foreground"
                                : "text-foreground group-hover:text-foreground"
                            )
                      )}
                    >
                      Select All {postType === 'post' ? 'Posts' : postType === 'service-area' ? 'Entities' : postType === 'page' ? 'Pages' : 'Items'} ({filteredItems.length})
                    </span>
                  </div>
                )}
                {filteredItems.map((item) => {
                  const isSelected = multiSelect ? selectedUrls.includes(item.link) : selectedUrl === item.link;
                  // Determine endpoint: use item's endpoint if available, otherwise infer
                  let endpoint = item.endpoint;
                  if (!endpoint) {
                    if (postType === 'post') {
                      endpoint = 'posts';
                    } else if (postType === 'service-area') {
                      endpoint = site.sitemaps?.endpoints && site.entitySitemapUrl
                        ? site.sitemaps.endpoints[site.entitySitemapUrl] || 'service-areas'
                        : 'service-areas';
                    } else if (postType === 'page') {
                      endpoint = 'pages';
                    } else {
                      // postType === 'both' - infer from item (only posts and entities, not pages)
                      // Check if item is in posts or serviceAreas
                      const isPost = posts.some(p => p.link === item.link);
                      if (isPost) {
                        endpoint = 'posts';
                      } else {
                        endpoint = site.sitemaps?.endpoints && site.entitySitemapUrl
                          ? site.sitemaps.endpoints[site.entitySitemapUrl] || 'service-areas'
                          : 'service-areas';
                      }
                    }
                  }
                  
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.link}
                      onSelect={() => {
                        if (multiSelect) {
                          handleToggleItem(item.link);
                        } else {
                          onValueChange(item.link);
                          if (onPostDataChange) {
                            const subtype = postType === 'post' ? 'post' : postType === 'service-area' ? 'service-area' : postType === 'page' ? 'page' : 
                              (posts.some(p => p.link === item.link) ? 'post' : 'service-area'); // 'both' only has posts and entities
                            onPostDataChange({
                              id: item.id,
                              subtype: subtype,
                              link: item.link,
                              slug: item.slug,
                              endpoint: endpoint,
                            });
                          }
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "group flex items-center px-3 py-2 transition-colors",
                        isDefault ? d!.text : "py-2.5",
                        isSelected
                          ? isDefault
                            ? cn(
                                "border-b border-border/40 border-x-0 border-t-0 text-foreground last:border-b-0",
                                d!.itemRowOn
                              )
                            : "rounded border border-border bg-ui-field-hover/80 text-foreground"
                          : isDefault
                            ? cn(
                                "border-b border-border/30 border-x-0 border-t-0 last:border-b-0",
                                d!.itemRow
                              )
                            : "rounded border border-transparent"
                      )}
                      data-selected={isSelected ? "true" : undefined}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleItem(item.link)}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "h-4 w-4",
                                !isDefault && "border-border data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover"
                              )}
                            />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected
                                  ? isDefault
                                    ? "text-foreground opacity-100"
                                    : "text-foreground opacity-100"
                                  : isDefault
                                    ? "text-muted-foreground opacity-0"
                                    : "text-foreground opacity-0"
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              "break-words font-semibold",
                              isDefault ? "text-base" : "text-sm",
                              isSelected
                                ? isDefault
                                  ? "text-foreground"
                                  : "text-foreground"
                                : isDefault
                                  ? "text-foreground group-hover:text-foreground"
                                  : "text-foreground group-hover:text-foreground"
                            )}
                          >
                            {item.title}
                          </span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isDefault ? "text-foreground" : "text-foreground"
                            )}
                          />
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

      {!multiSelect && (
        <div className="relative">
          <Field
            placeholder="Or enter URL manually"
            value={selectedUrl || ''}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
          />
          {selectedItem && (
            <Button
              variant="quiet"
              onClick={() => window.open(selectedItem.link, '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedItems.length > 0 && (
        <div
            className={cn(
              "flex items-center justify-between font-medium",
              isDefault ? cn(d!.text, "text-muted-foreground") : cn("text-sm", getCyberpunkTextClasses("muted"))
            )}
        >
          <span>
            {selectedItems.length} {postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'URL'}{selectedItems.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            pressed={Boolean(isDefault)}
            variant="quiet"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!site.username || !site.appPassword) {
                notify.error(NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE);
                return;
              }
              try {
                notify.info(NOTIFY_FETCHING_DATA);
                
                // Helper to find endpoint from sitemap by matching URL to sitemap URLs
                const findEndpointFromSitemap = (url: string, site: WordPressSite): string | undefined => {
                  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
                    return undefined;
                  }

                  const urlPath = new URL(url).pathname.toLowerCase();

                  // Check each sitemap's endpoint
                  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
                    const sitemapFilename = sitemapUrl.split('/').pop() || '';
                    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '').toLowerCase();
                    
                    if (urlPath.includes(sitemapType.replace(/s$/, '')) || urlPath.includes(sitemapType)) {
                      return endpoint;
                    }
                  }

                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^\/]+$/)) {
                    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
                      return 'pages';
                    }
                  }

                  return undefined;
                };

                // Determine endpoint using same priority as handleOptimizeContent
                let knownEndpoint = site.manualEndpoint;
                if (!knownEndpoint && selectedUrls.length > 0) {
                  knownEndpoint = findEndpointFromSitemap(selectedUrls[0], site);
                }

                const entitySitemapUrl = site.entitySitemapUrl || undefined;
                
                // Use entity logic - pass entitySitemapUrl and knownEndpoint
                const resolveResult = await resolveWordPressUrls(
                  site.siteUrl, 
                  site.username, 
                  site.appPassword, 
                  selectedUrls,
                  entitySitemapUrl,  // Pass entity sitemap URL
                  knownEndpoint      // Pass known endpoint
                );
                if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
                  notify.error(resolveResult.unresolvable?.[0]?.reason || 'Could not resolve URLs');
                  return;
                }
                const contentResult = await getWordPressPostContent(
                  site.siteUrl,
                  site.username,
                  site.appPassword,
                  undefined,
                  undefined,
                  resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }))
                );
                if (contentResult.error || !contentResult.posts || contentResult.posts.length === 0) {
                  notify.error(contentResult.error || 'Failed to fetch data');
                  return;
                }
                const jsonData = {
                  siteUrl: site.siteUrl,
                  siteName: site.name,
                  fetchedAt: new Date().toISOString(),
                  posts: contentResult.posts.map(post => ({
                    ...post.fullData || post,
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
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'sitemaps';
                a.download = `wordpress-${typeLabel}-${site.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                notify.success(notifyDownloadedXItemSAsJson(contentResult.posts.length));
              } catch (error) {
                console.error('[UnifiedContentSelector] Error scraping:', error);
                notify.error(error instanceof Error ? error.message : 'Failed to scrape');
              }
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            title={`Download ${postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'sitemap'} data as JSON`}
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

