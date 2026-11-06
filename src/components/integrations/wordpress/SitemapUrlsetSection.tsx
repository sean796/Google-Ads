import type { Dispatch, SetStateAction } from "react";
import { RefreshCw } from "lucide-react";
import { type WordPressSite } from "../types";
import { cn } from "@/lib/utils";
import { WP_PANEL_LIST_GAP } from "./wordpress-panel-chrome";
import type { SitemapSectionChrome } from "./sitemap-section-chrome";
import { Button, Field } from "@/ui";

type SitemapUrlsetSectionProps = {
  site: WordPressSite;
  chrome: SitemapSectionChrome;
  manualSitemapUrl: string;
  setManualSitemapUrl: Dispatch<SetStateAction<string>>;
  submitManualSitemap: () => void;
  onAppendManualChildSitemap?: (url: string) => void;
  onRefreshSitemaps?: () => void;
  isRefreshingSitemaps?: boolean;
  mainSitemapUrl?: string;
};

export function SitemapUrlsetSection({
  site,
  chrome,
  manualSitemapUrl,
  setManualSitemapUrl,
  submitManualSitemap,
  onAppendManualChildSitemap,
  onRefreshSitemaps,
  isRefreshingSitemaps = false,
  mainSitemapUrl,
}: SitemapUrlsetSectionProps) {
  if (!site.sitemaps || !site.sitemaps.urls) return null;
  return (
        <div className="space-y-2">
          {(onAppendManualChildSitemap || onRefreshSitemaps) && (
            <div className="flex flex-wrap items-center gap-1">
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
                    placeholder="https://example.com/page/"
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
          <div className={WP_PANEL_LIST_GAP}>
            {site.sitemaps.urls.slice(0, 10).map((url, idx) => (
              <div key={idx} className={cn(chrome.rowTile, "break-words px-3 py-2")}>
                {url}
              </div>
            ))}
            {site.sitemaps.urls.length > 10 && (
              <div className={cn("rounded-none px-3 py-2 text-base", chrome.muted)}>
                +{site.sitemaps.urls.length - 10} more
              </div>
            )}
          </div>
        </div>
  );
}
