import type { WordPressSite } from "../types";
import { getEditorialCountsRange, resolveEditorialCountsRangeForDashboard } from "@/lib/quarter-bounds";
import type { OptimizationActivityTileStats, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import { optimizationPeriodCapForPackage } from "@/lib/wordpress-optimization-package";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";

export function siteHasWpCredentials(site: WordPressSite): boolean {
  return Boolean(site.siteUrl?.trim() && site.username?.trim() && site.appPassword?.trim());
}

/** Before the hook fills state, keep the tile skeleton in a loading state. */
export function optimizationStatsForSite(
  site: WordPressSite,
  optimizationStatsBySite: Record<string, OptimizationActivityTileStats> | undefined,
): OptimizationActivityTileStats | undefined {
  if (!OPTIMIZATION_TILE_COUNTS_ENABLED) return undefined;
  if (!siteHasWpCredentials(site)) return undefined;
  const cap = optimizationPeriodCapForPackage(site.optimizationPackage);
  if (!cap) return undefined;
  const found = optimizationStatsBySite?.[site.id];
  if (found) return found;
  const range = getEditorialCountsRange(site.editorialCountsPeriodStartYmd, new Date());
  return {
    quarterLabel: range.quarterLabel,
    loading: true,
    totalOptimized: null,
    cap,
    remaining: null,
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}

export function quarterStatsForSite(
  site: WordPressSite,
  quarterStatsBySite: Record<string, QuarterEditorialTileStats> | undefined,
  selectedMonthKey: string,
): QuarterEditorialTileStats | undefined {
  if (!siteHasWpCredentials(site)) return undefined;
  const found = quarterStatsBySite?.[site.id];
  if (found) return found;
  const range = resolveEditorialCountsRangeForDashboard(
    site.editorialCountsPeriodStartYmd,
    selectedMonthKey,
    new Date(),
  );
  const sitemapDisabled = isEntitySitemapDisabled(site);
  const entityUrlActive = sitemapDisabled ? "" : site.entitySitemapUrl?.trim() ?? "";
  return {
    quarterLabel: range.quarterLabel,
    loading: true,
    postsLive: null,
    postsScheduled: null,
    entityLive: null,
    entityScheduled: null,
    entityConfigured: Boolean(site.manualEndpoint?.trim() || entityUrlActive),
    entityCountsAvailable: false,
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}
