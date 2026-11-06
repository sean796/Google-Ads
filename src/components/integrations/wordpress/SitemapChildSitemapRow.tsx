import type { Dispatch, SetStateAction } from "react";
import { Download, ChevronDown, Tag, CheckCircle2, Sparkles, Search, Calendar as CalendarIcon, Ban, Map } from "lucide-react";
import { type WordPressSite } from "../types";
import {
  getChildTagEntry,
  type SitemapSystemRole,
} from "@/lib/sitemap-child-tags";
import { PostCalendar } from "./PostCalendar";
import { cn } from "@/lib/utils";
import { SYSTEM_ROLE_LABELS, type SitemapSectionChrome } from "./sitemap-section-chrome";
import { Button, Badge, Dialog, DialogContent, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/ui";

type SitemapChildSitemapRowProps = {
  site: WordPressSite;
  url: string;
  idx: number;
  chrome: SitemapSectionChrome;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities: Record<string, boolean>;
  isIndexingSitemap: Record<string, boolean>;
  isLoadingCalendar: Record<string, boolean>;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap?: (sitemapUrl: string) => void;
  onToggleChildSitemapDisabled?: (childSitemapUrl: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
  onToggleChildSystemRole?: (childSitemapUrl: string, role: SitemapSystemRole) => void;
  onToggleChildCustomTag?: (childSitemapUrl: string, label: string) => void;
  openCalendars: Record<string, boolean>;
  setOpenCalendars: Dispatch<SetStateAction<Record<string, boolean>>>;
  handleCalendarOpenChange: (sitemapUrl: string, open: boolean) => void;
};

export function SitemapChildSitemapRow({
  site,
  url,
  idx,
  chrome,
  isScrapingSitemap,
  isGeneratingEntities,
  isIndexingSitemap,
  isLoadingCalendar,
  getScrapingKey,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onIndexSitemap,
  onLoadCalendarPosts,
  onToggleChildSystemRole,
  onToggleChildCustomTag,
  openCalendars,
  setOpenCalendars,
  handleCalendarOpenChange,
}: SitemapChildSitemapRowProps) {
              const tagEntry = getChildTagEntry(site, url);
              const isEntityRow =
                site.entitySitemapUrl === url || tagEntry.roles.includes("entity");
              const isCompetitorRow =
                site.competitorEntitySitemapUrl === url ||
                tagEntry.roles.includes("competitor");
              const rowDisabled =
                site.sitemaps?.disabledChildSitemapUrls?.includes(url) ?? false;
              const scrapingKey = getScrapingKey(site.id, url);
              const isScraping = isScrapingSitemap[scrapingKey] || false;
              const generatingKey = `${site.id}-${url}`;
              const isGenerating = isGeneratingEntities[generatingKey] || false;
              const indexingKey = `${site.id}-${url}`;
              const isIndexing = isIndexingSitemap[indexingKey] || false;
              const loadingKey = `${site.id}-${url}`;
              const isLoading = isLoadingCalendar[loadingKey] || false;
              const postMetadata = site.sitemaps?.postMetadata?.[url];
              const posts = postMetadata?.posts || [];
              const futureCount = posts.filter(post => {
                if (!post.date_gmt) return false;
                try {
                  const postDate = new Date(post.date_gmt);
                  return postDate > new Date() || post.status === 'future';
                } catch {
                  return false;
                }
              }).length;
              
              return (
                <div
                  key={idx}
                  className={cn(
                    chrome.rowTile,
                    "flex flex-wrap items-center gap-2 py-2.5 pr-1",
                    (site.entitySitemapUrl === url || isCompetitorRow) && chrome.rowTileEntity,
                  )}
                >
                    <span
                      className={cn(
                        "min-w-0 flex-1 break-words text-base",
                        chrome.urlText,
                        site.entitySitemapUrl !== url && !isCompetitorRow && "font-normal",
                      )}
                    >
                      {url}
                    </span>
                    {site.entitySitemapUrl === url && (
                      <Badge
                        variant="secondary"
                        className={chrome.badgeEntity}
                      >
                        <Tag className="mr-1 h-4 w-4" />
                        Entity
                      </Badge>
                    )}
                    {isCompetitorRow && (
                      <Badge
                        variant="secondary"
                        className={chrome.badgeEntity}
                      >
                        <Tag className="mr-1 h-4 w-4" />
                        Competitor
                      </Badge>
                    )}
                    {tagEntry.roles
                      .filter((r) => r !== "entity" && r !== "competitor")
                      .map((role) => (
                        <Badge key={role} variant="secondary" className={chrome.badgeSecondary}>
                          {SYSTEM_ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    {tagEntry.custom.map((label) => (
                      <Badge key={label} variant="secondary" className={chrome.badgeSecondary}>
                        {label}
                      </Badge>
                    ))}
                    {rowDisabled && (
                      <Badge
                        variant="secondary"
                        className={chrome.badgeMuted}
                      >
                        Excluded
                      </Badge>
                    )}
                    {futureCount > 0 && (
                      <Badge
                        variant="secondary"
                        className={chrome.badgeSecondary}
                      >
                        {futureCount} Future
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="quiet"
                          disabled={isScraping || site.enabled === false}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          {isScraping ? (
                            <>
                              
                              <span>Working…</span>
                            </>
                          ) : (
                            <>
                              <Map className="h-4 w-4" />
                              <span>Sitemap</span>
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                        className={chrome.menuContent}
                      >
                        {onToggleChildSitemapDisabled && !isEntityRow && !isCompetitorRow ? (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleChildSitemapDisabled(url);
                              }}
                              disabled={site.enabled === false}
                              className={chrome.menuItem}
                            >
                              {rowDisabled ? (
                                <>
                                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                                  Include in property
                                </>
                              ) : (
                                <>
                                  <Ban className="mr-2 h-4 w-4" aria-hidden />
                                  Exclude from property
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className={chrome.menuSep} />
                          </>
                        ) : null}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onScrapeChildSitemap(url);
                          }}
                          disabled={isScraping || site.enabled === false || rowDisabled}
                          className={chrome.menuItem}
                        >
                          {isScraping ? (
                            <>
                              
                              Scraping...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Scrape Sitemap
                            </>
                          )}
                        </DropdownMenuItem>
                        {onIndexSitemap && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onIndexSitemap(url);
                            }}
                            disabled={
                              isIndexing || isScraping || site.enabled === false || rowDisabled
                            }
                            className={chrome.menuItem}
                          >
                            {isIndexing ? (
                              <>
                                
                                Indexing...
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4 mr-2" />
                                Check & Request Indexing
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        {(onToggleChildSystemRole || onToggleChildCustomTag) && (
                          <>
                            <DropdownMenuSeparator className={chrome.menuSep} />
                            <DropdownMenuLabel className={cn(chrome.menuItem, "font-semibold")}>
                              Tags
                            </DropdownMenuLabel>
                            {onToggleChildSystemRole
                              ? (Object.keys(SYSTEM_ROLE_LABELS) as SitemapSystemRole[]).map(
                                  (role) => (
                                    <DropdownMenuCheckboxItem
                                      key={role}
                                      checked={tagEntry.roles.includes(role)}
                                      disabled={site.enabled === false}
                                      onCheckedChange={() =>
                                        onToggleChildSystemRole(url, role)
                                      }
                                      onSelect={(e) => e.preventDefault()}
                                      className={chrome.menuItem}
                                    >
                                      {SYSTEM_ROLE_LABELS[role]}
                                    </DropdownMenuCheckboxItem>
                                  ),
                                )
                              : null}
                            {(site.customSitemapTagLabels ?? []).map((label) =>
                              onToggleChildCustomTag ? (
                                <DropdownMenuCheckboxItem
                                  key={label}
                                  checked={tagEntry.custom.some(
                                    (t) => t.toLowerCase() === label.toLowerCase(),
                                  )}
                                  disabled={site.enabled === false}
                                  onCheckedChange={() => onToggleChildCustomTag(url, label)}
                                  onSelect={(e) => e.preventDefault()}
                                  className={chrome.menuItem}
                                >
                                  {label}
                                </DropdownMenuCheckboxItem>
                              ) : null,
                            )}
                          </>
                        )}
                        {onSetEntitySitemap ? (
                          <>
                            <DropdownMenuSeparator className={chrome.menuSep} />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSetEntitySitemap(url);
                              }}
                              disabled={site.enabled === false || rowDisabled}
                              className={chrome.menuItem}
                            >
                              {site.entitySitemapUrl === url ? (
                                <>
                                  <Ban className="mr-2 h-4 w-4" aria-hidden />
                                  Clear entity sitemap
                                </>
                              ) : (
                                <>
                                  <Tag className="mr-2 h-4 w-4" aria-hidden />
                                  Set as entity sitemap
                                </>
                              )}
                            </DropdownMenuItem>
                            {site.entitySitemapUrl === url && onEntityGeneration && (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // Use site.entitySitemapUrl instead of the clicked URL
                                  // This ensures we use the entity sitemap the user has set
                                  const entitySitemapUrl = site.entitySitemapUrl || url;
                                  onEntityGeneration(entitySitemapUrl);
                                }}
                                disabled={isGenerating || site.enabled === false || rowDisabled}
                                className={chrome.menuItem}
                              >
                                {isGenerating ? (
                                  <>
                                    
                                    Generating Entities...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate Origins
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </>
                        ) : null}
                        {onSetCompetitorEntitySitemap ? (
                          <>
                            <DropdownMenuSeparator className={chrome.menuSep} />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSetCompetitorEntitySitemap(url);
                              }}
                              disabled={site.enabled === false || rowDisabled}
                              className={chrome.menuItem}
                            >
                              {site.competitorEntitySitemapUrl === url ? (
                                <>
                                  <Ban className="mr-2 h-4 w-4" aria-hidden />
                                  Clear competitor sitemap
                                </>
                              ) : (
                                <>
                                  <Tag className="mr-2 h-4 w-4" aria-hidden />
                                  Set as competitor sitemap
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {(onLoadCalendarPosts || openCalendars[url]) && (
                          <>
                            <DropdownMenuSeparator className={chrome.menuSep} />
                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onLoadCalendarPosts) {
                                  const postMetadata = site.sitemaps?.postMetadata?.[url];
                                  if (!postMetadata || !postMetadata.posts || postMetadata.posts.length === 0) {
                                    setOpenCalendars(prev => ({ ...prev, [url]: true }));
                                    onLoadCalendarPosts(url);
                                  } else {
                                    setOpenCalendars(prev => ({ ...prev, [url]: !prev[url] }));
                                  }
                                } else {
                                  setOpenCalendars(prev => ({ ...prev, [url]: !prev[url] }));
                                }
                              }}
                              disabled={isLoading || site.enabled === false || rowDisabled}
                              className={chrome.menuItem}
                            >
                              {isLoading ? (
                                <>
                                  
                                  Loading Calendar...
                                </>
                              ) : (
                                <>
                                  <CalendarIcon className="h-4 w-4 mr-2" />
                                  View Post Schedule Calendar
                                </>
                              )}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Dialog
                      open={openCalendars[url] || false}
                      onOpenChange={(open) => {
                        handleCalendarOpenChange(url, open);
                      }}
                    >
                      <DialogContent
                        className="max-w-4xl w-full rounded-lg border-0 bg-card p-0 text-foreground shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {isLoading ? (
                          <div className={cn("flex items-center gap-3 p-4 text-base text-foreground")}>
                            
                            Loading posts from WordPress API...
                          </div>
                        ) : posts.length > 0 ? (
                          <div className="p-3" key={`calendar-${url}-${posts.length}`}>
                            <PostCalendar 
                              posts={posts} 
                              sitemapUrl={url}
                              onRefresh={() => onLoadCalendarPosts?.(url)}
                              isRefreshing={isLoading}
                            />
                          </div>
                        ) : (
                          <div className={cn("p-4 text-center text-base", chrome.muted)}>
                            No post metadata available. Loading...
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                </div>
  );
}
