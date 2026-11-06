import React, { useState } from "react";
import { RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Field, Popover, PopoverContent, PopoverTrigger, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, Checkbox } from "@/ui";
import type { UnifiedContentSelectorProps } from "./UnifiedContentSelector-types";
import { unifiedContentSelectorDefaultStyles } from "./UnifiedContentSelector-theme";
import { useUnifiedContentSelector } from "./use-unified-content-selector";
import { UnifiedContentSelectorScrapeBar } from "./UnifiedContentSelectorScrapeBar";

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
  const d = unifiedContentSelectorDefaultStyles(isDefault);
  const [open, setOpen] = useState(false);
  const {
    posts,
    isLoading,
    searchQuery,
    setSearchQuery,
    hasNoPosts,
    hasNoEntities,
    hasNoPages,
    setHasNoPosts,
    setHasNoEntities,
    setHasNoPages,
    selectedUrls,
    selectedUrl,
    selectedItem,
    selectedItems,
    fetchPosts,
    fetchEntities,
    fetchPages,
    filteredItems,
    allFilteredSelected,
    handleSelectAll,
    handleToggleItem,
    getDisplayText,
  } = useUnifiedContentSelector({ site, value, onValueChange, postType, open, multiSelect });
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
        <UnifiedContentSelectorScrapeBar
          site={site}
          postType={postType}
          selectedUrls={selectedUrls}
          selectedItems={selectedItems}
          isDefault={isDefault}
          d={d}
          disabled={disabled}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};
