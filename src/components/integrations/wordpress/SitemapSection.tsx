import React, { useState, useCallback } from "react";
import { Map, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { WP_PANEL_LIST_GAP } from "./wordpress-panel-chrome";
import {
  sitemapSectionChrome,
  smFlatScroll,
  type SitemapSectionProps,
} from "./sitemap-section-chrome";
import { SitemapChildSitemapRow } from "./SitemapChildSitemapRow";
import { SitemapUrlsetSection } from "./SitemapUrlsetSection";
import { Button, Field } from "@/ui";

export const SitemapSection: React.FC<SitemapSectionProps> = ({
  site,
  layout = "default",
  isScrapingSitemap,
  isGeneratingEntities = {},
  isIndexingSitemap = {},
  isLoadingCalendar = {},
  getScrapingKey,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onIndexSitemap,
  onLoadCalendarPosts,
  onRefreshSitemaps,
  isRefreshingSitemaps = false,
  onAppendManualChildSitemap,
  onAddCustomSitemapTagLabel,
  onToggleChildSystemRole,
  onToggleChildCustomTag,
}) => {
  const chrome = sitemapSectionChrome(layout);
  const [openCalendars, setOpenCalendars] = useState<Record<string, boolean>>({});
  const [manualSitemapUrl, setManualSitemapUrl] = useState("");
  const [newCustomTagLabel, setNewCustomTagLabel] = useState("");

  const handleCalendarOpenChange = useCallback((sitemapUrl: string, open: boolean) => {
    setOpenCalendars(prev => ({ ...prev, [sitemapUrl]: open }));
    if (open && onLoadCalendarPosts) {
      const postMetadata = site.sitemaps?.postMetadata?.[sitemapUrl];
      if (!postMetadata || !postMetadata.posts || postMetadata.posts.length === 0) {
        onLoadCalendarPosts(sitemapUrl);
      }
    }
  }, [site.sitemaps, onLoadCalendarPosts]);

  const submitManualSitemap = useCallback(() => {
    if (!onAppendManualChildSitemap) return;
    onAppendManualChildSitemap(manualSitemapUrl);
    setManualSitemapUrl("");
  }, [manualSitemapUrl, onAppendManualChildSitemap]);

  if (!site.sitemaps) {
    return (
      <div className={chrome.emptyShell}>
        <p className={chrome.muted}>No sitemaps detected for this property yet.</p>
        {onRefreshSitemaps ? (
          <Button
            variant="quiet"
            type="button"
            disabled={site.enabled === false || isRefreshingSitemaps}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRefreshSitemaps();
            }}
          >
            {isRefreshingSitemaps ? (
              null
            ) : (
              <Map className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {isRefreshingSitemaps ? "Detecting Sitemaps…" : "Detect Sitemaps"}
          </Button>
        ) : null}
      </div>
    );
  }

  const mainSitemapUrl = site.sitemaps.mainSitemapUrl?.replace(
    "/wp-sitemap.xml",
    "/sitemap_index.xml",
  );

  return (
    <div className={chrome.sectionShell}>
      {site.sitemaps.type === "index" && site.sitemaps.childSitemaps && (
        <div className="space-y-2">
          {(onAppendManualChildSitemap || onRefreshSitemaps || onAddCustomSitemapTagLabel) && (
            <div className="flex flex-wrap items-center gap-1">
              {onAddCustomSitemapTagLabel && (
                <>
                  <Field
                    value={newCustomTagLabel}
                    onChange={(e) => setNewCustomTagLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const label = newCustomTagLabel.trim();
                        if (label) {
                          onAddCustomSitemapTagLabel(label);
                          setNewCustomTagLabel("");
                        }
                      }
                    }}
                    placeholder="Custom tag label"
                    disabled={site.enabled === false}
                  />
                  <Button
                    variant="quiet"
                    type="button"
                    disabled={site.enabled === false || !newCustomTagLabel.trim()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const label = newCustomTagLabel.trim();
                      if (!label) return;
                      onAddCustomSitemapTagLabel(label);
                      setNewCustomTagLabel("");
                    }}
                  >
                    Add tag
                  </Button>
                </>
              )}
              {onAppendManualChildSitemap && (
                <>
                  <Field
                    value={manualSitemapUrl}
                    onChange={(e) => setManualSitemapUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitManualSitemap();
                      }
                    }}
                    placeholder="https://example.com/custom-sitemap.xml"
                    disabled={site.enabled === false}
                  />
                  <Button
                    variant="quiet"
                    type="button"
                    disabled={site.enabled === false}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      submitManualSitemap();
                    }}
                  >
                    Add
                  </Button>
                </>
              )}
              {onRefreshSitemaps && (
                <Button
                  variant="quiet"
                  type="button"
                  disabled={site.enabled === false || isRefreshingSitemaps}
                  title={mainSitemapUrl}
                  aria-label="Redetect sitemaps"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRefreshSitemaps();
                  }}
                >
                  {isRefreshingSitemaps ? (
                    null
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              )}
            </div>
          )}
          <div className={cn(WP_PANEL_LIST_GAP, smFlatScroll)}>
            {site.sitemaps.childSitemaps.map((url, idx) => (
              <SitemapChildSitemapRow
                key={idx}
                site={site}
                url={url}
                idx={idx}
                chrome={chrome}
                isScrapingSitemap={isScrapingSitemap}
                isGeneratingEntities={isGeneratingEntities}
                isIndexingSitemap={isIndexingSitemap}
                isLoadingCalendar={isLoadingCalendar}
                getScrapingKey={getScrapingKey}
                onScrapeChildSitemap={onScrapeChildSitemap}
                onEntityGeneration={onEntityGeneration}
                onSetEntitySitemap={onSetEntitySitemap}
                onSetCompetitorEntitySitemap={onSetCompetitorEntitySitemap}
                onToggleChildSitemapDisabled={onToggleChildSitemapDisabled}
                onIndexSitemap={onIndexSitemap}
                onLoadCalendarPosts={onLoadCalendarPosts}
                onToggleChildSystemRole={onToggleChildSystemRole}
                onToggleChildCustomTag={onToggleChildCustomTag}
                openCalendars={openCalendars}
                setOpenCalendars={setOpenCalendars}
                handleCalendarOpenChange={handleCalendarOpenChange}
              />
            ))}
          </div>
        </div>
      )}

      {site.sitemaps.type === "urlset" && site.sitemaps.urls && (
        <SitemapUrlsetSection
          site={site}
          chrome={chrome}
          manualSitemapUrl={manualSitemapUrl}
          setManualSitemapUrl={setManualSitemapUrl}
          submitManualSitemap={submitManualSitemap}
          onAppendManualChildSitemap={onAppendManualChildSitemap}
          onRefreshSitemaps={onRefreshSitemaps}
          isRefreshingSitemaps={isRefreshingSitemaps}
          mainSitemapUrl={mainSitemapUrl}
        />
      )}
    </div>
  );
};
