import React from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWordPressPostContent, resolveWordPressUrls } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FETCHING_DATA, NOTIFY_SITE_CREDENTIALS_NOT_AVAILABLE, notifyDownloadedXItemSAsJson } from "@/lib/notify-messages";
import { getCyberpunkTextClasses } from "./cyberpunk-theme";
import { Button } from "@/ui";
import { logger } from "@/lib/logger";
import type { UnifiedContentSelectorDefaultStyles } from "./UnifiedContentSelector-theme";

export const UnifiedContentSelectorScrapeBar: React.FC<{
  site: WordPressSite;
  postType: 'post' | 'service-area' | 'page' | 'both';
  selectedUrls: string[];
  selectedItems: readonly unknown[];
  isDefault: boolean;
  d: UnifiedContentSelectorDefaultStyles;
  disabled: boolean;
  isLoading: boolean;
}> = ({ site, postType, selectedUrls, selectedItems, isDefault, d, disabled, isLoading }) => {
  return (
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

                  if (urlPath.includes('/page/') || urlPath.match(/^\/[^/]+$/)) {
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
                logger.error('[UnifiedContentSelector] Error scraping:', error);
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
  );
};
