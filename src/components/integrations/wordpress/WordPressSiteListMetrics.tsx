import React from "react";
import { FileText, MapPin, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import type { OptimizationActivityTileStats, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { siteHasWpCredentials } from "./wordpress-site-list-stats";
import { editorialQuotasForSite } from "@/lib/editorial-content-package";
import {
  PROPERTY_METRIC_COUNT_SLOT_CLASS,
  formatQuarterCountCell,
  formatScheduledVsQuota,
  nextEditorialPeriodTooltipText,
  propertyMetricCellClass,
  propertyMetricCellWidths,
  quarterPairTotalForStrip,
  quarterStripTooltip,
} from "./wordpress-site-list-metrics";

export function QuarterEditorialCountsStrip({
  site,
  stats,
  rowDisplay = "compact",
}: {
  site: WordPressSite;
  stats: QuarterEditorialTileStats | undefined;
  rowDisplay?: WordPressPropertyRowDisplay;
}) {
  if (!siteHasWpCredentials(site) || !stats) return null;

  const editorialQuotas = editorialQuotasForSite(site);

  const hasManualEndpoint = Boolean(site.manualEndpoint?.trim());
  const sitemapDisabled = isEntitySitemapDisabled(site) && !hasManualEndpoint;
  const entityCountsPending =
    stats.loading && stats.entityConfigured && !stats.entityCountsAvailable;
  const showEntityCount =
    !sitemapDisabled && stats.entityConfigured && (stats.entityCountsAvailable || entityCountsPending);

  const postsDisplayLoading =
    stats.loading && (stats.postsLive === null || stats.postsScheduled === null);
  const loading = stats.loading;
  const postsTotal = quarterPairTotalForStrip(
    stats.postsLive,
    stats.postsScheduled,
    postsDisplayLoading,
  );
  const entityDisplayLoading =
    entityCountsPending ||
    (stats.loading && (stats.entityLive === null || stats.entityScheduled === null));
  const entitiesTotal = showEntityCount
    ? quarterPairTotalForStrip(stats.entityLive, stats.entityScheduled, entityDisplayLoading)
    : null;
  const compact = rowDisplay === "compact";
  const mw = propertyMetricCellWidths(rowDisplay);
  const metricCell = propertyMetricCellClass(compact);
  const iconClass = cn("shrink-0 text-primary", compact ? "h-4 w-4" : "h-5 w-5");
  const postsCountClass = cn(
    PROPERTY_METRIC_COUNT_SLOT_CLASS,
    editorialQuotas && "min-w-[2.75rem]",
    "shrink-0 font-light tracking-tight text-foreground",
    compact ? "text-lg leading-none" : "text-xl leading-none",
  );
  const postsMetricLabel = editorialQuotas
    ? formatScheduledVsQuota(
        postsTotal,
        editorialQuotas.blogsPerMonth,
        postsDisplayLoading,
      )
    : formatQuarterCountCell(postsTotal, postsDisplayLoading);
  const entityMetricLabel =
    editorialQuotas && showEntityCount
      ? formatScheduledVsQuota(
          entitiesTotal,
          editorialQuotas.sapsPerMonth,
          entityDisplayLoading,
        )
      : formatQuarterCountCell(entitiesTotal, entityDisplayLoading);
  const entityIconClass = cn("shrink-0 text-primary", compact ? "h-4 w-4" : "h-5 w-5");
  const entityCountClass = cn(
    PROPERTY_METRIC_COUNT_SLOT_CLASS,
    editorialQuotas && "min-w-[2.75rem]",
    "shrink-0 font-light tracking-tight text-foreground",
    compact ? "text-lg leading-none" : "text-xl leading-none",
  );

  const stripSummaryTitle = stats.errorTitle
    ? `${stats.errorTitle}. ${quarterStripTooltip(stats, postsDisplayLoading)}`
    : quarterStripTooltip(stats, postsDisplayLoading);

  const postsTooltipIso = stats.countsPeriodEndExclusiveIso?.trim();
  const postsTooltip = postsTooltipIso ? nextEditorialPeriodTooltipText(postsTooltipIso) : "";

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const postsMetricInner = (
    <span
      className={cn(
        "flex min-w-0 items-center justify-center gap-1 text-foreground",
        postsTooltip && "cursor-default",
      )}
      aria-label={
        editorialQuotas
          ? `Blog posts published and scheduled this month: ${postsMetricLabel}`
          : `Posts in period: ${postsMetricLabel}`
      }
    >
      <FileText className={iconClass} aria-hidden />
      <span className={postsCountClass}>{postsMetricLabel}</span>
    </span>
  );

  const postsFramed = (
    <div
      className={cn(metricCell, mw.posts, "text-foreground")}
      title={stripSummaryTitle}
      onClick={stop}
      onPointerDown={stop}
    >
      {postsTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{postsMetricInner}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-base">
            {postsTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        postsMetricInner
      )}
    </div>
  );

  const entityDisabledTitle = sitemapDisabled
    ? "Entity sitemap is disabled in the dashboard. Re-enable it in the Sitemap menu to track this count."
    : "Entity counts not configured for this property";

  const entityFramed = showEntityCount ? (
    <div
      className={cn(metricCell, mw.ent, "text-foreground")}
      title={stripSummaryTitle}
      onClick={stop}
      onPointerDown={stop}
      aria-label={
        editorialQuotas
          ? `SAP posts published and scheduled this month: ${entityMetricLabel}`
          : `Entities in period: ${entityMetricLabel}`
      }
    >
      <MapPin className={entityIconClass} aria-hidden />
      <span className={entityCountClass}>{entityMetricLabel}</span>
    </div>
  ) : (
    <div
      className={cn(
        metricCell,
        mw.ent,
        "text-muted-foreground/60 pointer-events-none select-none",
      )}
      title={entityDisabledTitle}
      aria-label={sitemapDisabled ? "Entity sitemap disabled (N/A)" : "Entity counts not configured (N/A)"}
    >
      <span
        className={cn(
          "font-medium tabular-nums tracking-tight text-muted-foreground/70",
          compact ? "text-sm leading-none" : "text-base leading-none",
        )}
      >
        N/A
      </span>
    </div>
  );

  return (
    <>
      {postsFramed}
      {entityFramed}
    </>
  );
}

/** Inner flex for metrics placed inside each black metric cell frame. */
const OPT_ACTIVITY_STRIP_CLASS =
  "flex h-full w-full min-w-0 items-center justify-center gap-1.5 tabular-nums text-semantic-analysis-foreground";

export function OptimizationActivityStrip({
  site,
  stats,
  rowDisplay = "compact",
}: {
  site: WordPressSite;
  stats: OptimizationActivityTileStats | undefined;
  rowDisplay?: WordPressPropertyRowDisplay;
}) {
  if (!stats) return null;
  const compact = rowDisplay === "compact";
  const usedForLabel =
    stats.loading && stats.totalOptimized === null
      ? 0
      : stats.totalOptimized ?? 0;
  const label = `${usedForLabel}/${stats.cap}`;
  const remainingForTitle = stats.remaining ?? 0;
  const title = stats.errorTitle
    ? stats.errorTitle
    : `Optimizations this period (${stats.quarterLabel}): published posts and entity CPT (when configured) whose ACF date_modifier falls in this window and is not the same UTC calendar day as the publish date. Remaining: ${remainingForTitle}.`;

  return (
    <div
      className={cn(OPT_ACTIVITY_STRIP_CLASS)}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={title}
    >
      <Sparkles className={cn("shrink-0 text-semantic-analysis-foreground", compact ? "h-4 w-4" : "h-5 w-5")} aria-hidden />
      <span
        className={cn(
          PROPERTY_METRIC_COUNT_SLOT_CLASS,
          "shrink-0 font-light tracking-tight text-semantic-analysis-foreground",
          compact ? "text-lg leading-none" : "text-xl leading-none",
        )}
      >
        {label}
      </span>
    </div>
  );
}
