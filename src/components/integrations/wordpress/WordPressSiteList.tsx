import React, { useState } from "react";
import { Checkbox } from "@/ui";
import { cn } from "@/lib/utils";
import { CompactWordPressTile } from "./CompactWordPressTile";
import { SiteDisplayNameDialog } from "@/components/manager/SiteDisplayNameDialog";
import type { WordPressSite } from "../types";
import type { OptimizationActivityTileStats, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import {
  PROPERTIES_EMPTY,
  PROPERTIES_LIST_STACK,
  propertiesRowOuterClass,
} from "./wordpress-properties-surfaces";
import {
  optimizationStatsForSite,
  quarterStatsForSite,
} from "./wordpress-site-list-stats";
import {
  PROPERTY_METRICS_CLUSTER_CLASS,
  propertyMetricCellClass,
  propertyMetricCellWidths,
} from "./wordpress-site-list-metrics";
import {
  OptimizationActivityStrip,
  QuarterEditorialCountsStrip,
} from "./WordPressSiteListMetrics";

export { OptimizationActivityStrip, QuarterEditorialCountsStrip } from "./WordPressSiteListMetrics";

interface WordPressSiteListProps {
  sites: WordPressSite[];
  filteredSites: WordPressSite[];
  editorialPackageFilter?: "all" | "standard" | "lite" | "unassigned";
  siteSearchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenProfile: (site: WordPressSite) => void;
  isTesting: string | null;
  isDetecting: string | null;
  isFetchingScheduled: string | null;
  isScrapingSitemap: Record<string, boolean>;
  isIndexingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isExtractingNAPAndGraph: Record<string, boolean>;
  isLoadingCalendar: Record<string, boolean>;
  onTest: (site: WordPressSite) => void;
  onToggleEnabled: (site: WordPressSite) => void;
  onConnectSite: (site: WordPressSite) => void;
  onDetect: (site: WordPressSite) => void;
  onEdit: (site: WordPressSite) => void;
  onDelete: (siteId: string) => void;
  onScrapeChildSitemap: (site: WordPressSite, url: string) => void;
  onIndexSitemap: (site: WordPressSite, url: string) => void;
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  onSetEntitySitemap: (site: WordPressSite, sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap: (site: WordPressSite, sitemapUrl: string) => void;
  onToggleChildSitemapDisabled: (site: WordPressSite, childSitemapUrl: string) => void;
  onAppendManualChildSitemap: (site: WordPressSite, url: string) => void;
  onLoadCalendarPosts: (site: WordPressSite, sitemapUrl: string) => void;
  onExtractNAPAndGraph: (site: WordPressSite) => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  selectedSiteIds?: Set<string>;
  onSelectAll?: (selected: boolean) => void;
  onSiteSelectedChange?: (siteId: string, selected: boolean) => void;
  onDeleteSelected?: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  quarterStatsBySite?: Record<string, QuarterEditorialTileStats>;
  optimizationStatsBySite?: Record<string, OptimizationActivityTileStats>;
  editorialSelectedMonthKey?: string;
  editorialMonthOptions?: Array<{ key: string; label: string }>;
  onEditorialMonthChange?: (monthKey: string) => void;
  /** Visual density for property rows only (local preference). */
  propertyRowDisplay?: WordPressPropertyRowDisplay;
}

export const WordPressSiteList: React.FC<WordPressSiteListProps> = ({
  sites,
  filteredSites,
  editorialPackageFilter = "all",
  siteSearchQuery,
  onSearchChange,
  onOpenProfile,
  isTesting,
  isDetecting,
  isFetchingScheduled,
  isScrapingSitemap,
  isIndexingSitemap,
  isGeneratingEntities = {},
  isExtractingNAPAndGraph,
  isLoadingCalendar,
  onTest,
  onToggleEnabled,
  onConnectSite,
  onDetect,
  onEdit,
  onDelete,
  onScrapeChildSitemap,
  onIndexSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onAppendManualChildSitemap,
  onLoadCalendarPosts,
  onExtractNAPAndGraph,
  getScrapingKey,
  selectedSiteIds,
  onSelectAll,
  onSiteSelectedChange,
  onDeleteSelected,
  onPatchSite,
  quarterStatsBySite,
  optimizationStatsBySite,
  editorialSelectedMonthKey,
  editorialMonthOptions,
  onEditorialMonthChange,
  propertyRowDisplay = "compact",
}) => {
  const [canonicalRenameSite, setCanonicalRenameSite] = useState<WordPressSite | null>(null);

  const renderPropertyRowTrailingControls = (site: WordPressSite) => {
    const compact = propertyRowDisplay === "compact";
    const mw = propertyMetricCellWidths(propertyRowDisplay);
    const metricCell = propertyMetricCellClass(compact);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    return (
    <div className="flex min-w-0 shrink-0 items-stretch">
      <div
        className={cn(PROPERTY_METRICS_CLUSTER_CLASS, "min-w-0")}
        onClick={stop}
        onPointerDown={stop}
      >
        {OPTIMIZATION_TILE_COUNTS_ENABLED ? (
          <div className={cn(metricCell, mw.opt)}>
            <OptimizationActivityStrip
              site={site}
              stats={optimizationStatsForSite(site, optimizationStatsBySite)}
              rowDisplay={propertyRowDisplay}
            />
          </div>
        ) : null}
        <QuarterEditorialCountsStrip
          site={site}
          stats={quarterStatsForSite(
            site,
            quarterStatsBySite,
            editorialSelectedMonthKey ?? "",
          )}
          rowDisplay={propertyRowDisplay}
        />
      </div>
    </div>
    );
  };

  if (sites.length === 0) {
    return (
      <div className="mt-0 flex min-h-0 flex-1 flex-col">
        <div className={PROPERTIES_EMPTY}>
          <p className="text-lg text-foreground">No WordPress sites connected</p>
          <p className="mt-2 text-base text-foreground">
            Click &quot;Add Site&quot; to connect your first WordPress site
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-0 flex min-h-0 flex-1 flex-col">
      <SiteDisplayNameDialog
        variant="canonical"
        open={Boolean(canonicalRenameSite)}
        site={canonicalRenameSite}
        onOpenChange={(open) => {
          if (!open) setCanonicalRenameSite(null);
        }}
        onSave={(siteId, name) => {
          const trimmed = name.trim();
          if (!trimmed || !onPatchSite) return;
          onPatchSite(siteId, { name: trimmed });
        }}
      />
      {filteredSites.length === 0 ? (
        <div className={cn(PROPERTIES_EMPTY, "shrink-0 py-8 sm:py-10")}>
          <p className="text-base text-foreground">
            {siteSearchQuery.trim()
              ? `No sites found matching "${siteSearchQuery.trim()}".`
              : editorialPackageFilter !== "all"
                ? `No properties in the ${editorialPackageFilter === "unassigned" ? "Unassigned" : editorialPackageFilter === "lite" ? "Lite" : "Standard"} editorial tier.`
                : "No properties to show."}
          </p>
        </div>
      ) : (
        <div className="neo-pulse-manager-tab-scroll flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-auto">
        <div className={PROPERTIES_LIST_STACK}>
          {filteredSites.map((site, index) => {
            const rowSelected = selectedSiteIds?.has(site.id) ?? false;

            return (
              <div key={site.id} className="min-w-0 w-full">
                <div
                  className={propertiesRowOuterClass(
                    propertyRowDisplay,
                    index,
                    rowSelected,
                    true,
                  )}
                >
                  {onSiteSelectedChange ? (
                    <div className="flex shrink-0 items-center justify-center pl-0.5">
                      <Checkbox
                        checked={rowSelected}
                        onCheckedChange={(c) => onSiteSelectedChange(site.id, c === true)}
                        className="border-border/60 data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover data-[state=checked]:text-muted-foreground"
                        aria-label={`Select ${site.name}`}
                      />
                    </div>
                  ) : null}
                  <div className="flex min-h-0 min-w-0 flex-1 items-center border-0 bg-transparent px-0 py-0">
                    <CompactWordPressTile
                      variant="listRow"
                      site={site}
                      isTesting={isTesting === site.id}
                      isExpanded={false}
                      onToggle={() => onOpenProfile(site)}
                      onTest={() => onTest(site)}
                      onToggleEnabled={() => onToggleEnabled(site)}
                      propertyRowDisplay={propertyRowDisplay}
                      listRowBlackActionChrome
                      onOpenProfile={() => onOpenProfile(site)}
                      onDelete={() => onDelete(site.id)}
                      onApplyDisplayNameFromGmb={
                        onPatchSite ? (name) => onPatchSite(site.id, { name }) : undefined
                      }
                      onEditCanonicalName={
                        onPatchSite ? () => setCanonicalRenameSite(site) : undefined
                      }
                    />
                  </div>
                  <div
                    className={cn(
                      "flex min-w-0 shrink-0 items-center",
                      propertyRowDisplay === "compact" ? "gap-2 sm:gap-2" : "gap-3 sm:gap-4",
                    )}
                  >
                    {renderPropertyRowTrailingControls(site)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}
    </div>
  );
};
