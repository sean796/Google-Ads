/**
 * Report Discovery Layer
 * Fetches WordPress site context and GSC data for agentic report planning
 */

import type { WordPressSite, GSCPerformanceStats, GA4ReportData, GMBReportData } from "@/components/integrations/types";
import type { EntityPagesData, HistoricalData } from "./gsc-report-generator";
import { parseSitemap, getPublishedPosts, getPublishedPages } from "./wordpress-api";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export interface ReportDiscoveryDateRanges {
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
}

export interface WordPressSiteContext {
  siteName: string;
  siteUrl: string;
  hasCredentials: boolean;
  napInfo?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  locationsCount: number;
  entitySitemapUrl?: string;
  entitySitemapUrls: string[]; // Parsed URLs from entity sitemap
  entitySitemapCount: number;
  postsCount: number;
  pagesCount: number;
  sampleTitles: string[]; // For business-type inference
  inferredBusinessType?: string; // Optional: local-service, content-site, multi-location, etc.
}

export interface ReportDiscoveryData {
  site: WordPressSite;
  wordPressContext: WordPressSiteContext;
  stats: GSCPerformanceStats;
  entityPagesData: EntityPagesData | null;
  historicalData: HistoricalData | null;
  /** GA4 conversion and organic traffic when site has ga4PropertyId and backend returns data */
  ga4Data?: GA4ReportData | null;
  /** GMB (Google Business Profile) performance: calls, directions, website clicks for two periods when connected */
  gmbData?: GMBReportData | null;
  entityCoverage?: {
    totalInSitemap: number;
    totalInGSC: number;
    notInGSC: string[]; // Entity URLs in sitemap but not appearing in GSC
    indexedPercent: number;
  };
}

/**
 * Fetch all data needed for agentic report planning.
 * Combines WordPress site context with GSC performance data.
 */
export async function fetchReportDiscoveryData(
  site: WordPressSite,
  dateRanges: ReportDiscoveryDateRanges,
  apiBase: string,
  onProgress?: (message: string) => void
): Promise<ReportDiscoveryData> {
  const wordPressContext = await fetchWordPressContext(site, onProgress);

  onProgress?.("Fetching GSC performance stats...");
  const stats = await fetchGSCPerformanceStats(apiBase, site.siteUrl, dateRanges);

  let ga4Data: GA4ReportData | null = null;
  const ga4PropertyId = site.ga4PropertyId?.trim();
  if (ga4PropertyId) {
    try {
      onProgress?.("Fetching GA4 report data...");
      const gaResponse = await fetch(`${apiBase}/api/ga/report-data`, {
        method: "POST",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          propertyId: ga4PropertyId,
          startDate: dateRanges.startDate,
          endDate: dateRanges.endDate,
          compareStartDate: dateRanges.compareStartDate,
          compareEndDate: dateRanges.compareEndDate,
        }),
      });
      if (gaResponse.ok) {
        const gaResult = await gaResponse.json();
        if (gaResult.success && (gaResult.conversions != null || gaResult.organicTraffic != null)) {
          ga4Data = {};
          if (gaResult.conversions) ga4Data.conversions = gaResult.conversions;
          if (gaResult.organicTraffic) ga4Data.organicTraffic = gaResult.organicTraffic;
        }
      }
    } catch {
      // Non-fatal: report continues without GA4 data
    }
  }

  let gmbData: GMBReportData | null = null;
  const gbpLocationId = site.gbpLocationId?.trim();
  if (gbpLocationId) {
    try {
      onProgress?.("Fetching GMB performance...");
      const gmbResponse = await fetch(`${apiBase}/api/gmb/performance`, {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          startDate: dateRanges.startDate,
          endDate: dateRanges.endDate,
          compareStartDate: dateRanges.compareStartDate,
          compareEndDate: dateRanges.compareEndDate,
          locationIds: [gbpLocationId],
        }),
      });
      if (gmbResponse.ok) {
        const gmbResult = await gmbResponse.json();
        if (gmbResult.success && gmbResult.currentPeriod) {
          gmbData = {
            locationCount: gmbResult.locationCount ?? 1,
            currentPeriod: {
              startDate: gmbResult.currentPeriod.startDate,
              endDate: gmbResult.currentPeriod.endDate,
              calls: gmbResult.currentPeriod.calls ?? 0,
              directions: gmbResult.currentPeriod.directions ?? 0,
              websiteClicks: gmbResult.currentPeriod.websiteClicks ?? 0,
            },
            comparisonPeriod: {
              startDate: gmbResult.comparisonPeriod?.startDate ?? dateRanges.compareStartDate,
              endDate: gmbResult.comparisonPeriod?.endDate ?? dateRanges.compareEndDate,
              calls: gmbResult.comparisonPeriod?.calls ?? 0,
              directions: gmbResult.comparisonPeriod?.directions ?? 0,
              websiteClicks: gmbResult.comparisonPeriod?.websiteClicks ?? 0,
            },
          };
        }
      }
    } catch {
      // Non-fatal: report continues without GMB data
    }
  }

  let historicalData: HistoricalData | null = null;
  try {
    onProgress?.("Fetching historical data...");
    const histResponse = await fetch(`${apiBase}/api/gsc/fetch-historical-stats`, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ siteUrl: site.siteUrl }),
    });
    if (histResponse.ok) {
      const histData = await histResponse.json();
      if (histData.success) {
        historicalData = histData;
      }
    }
  } catch {
    // Non-fatal
  }

  let entityPagesData: EntityPagesData | null = null;
  if (site.entitySitemapUrl) {
    try {
      onProgress?.("Fetching entity pages performance...");
      const sitemapPath = new URL(site.entitySitemapUrl).pathname;
      const pathMatch = sitemapPath.match(/\/([a-z-]+)-sitemap\.xml$/i);
      const entityPathPattern = pathMatch ? `/${pathMatch[1]}/` : "/service-area/";

      const entityResponse = await fetch(`${apiBase}/api/gsc/fetch-entity-pages-performance`, {
        method: "POST",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          siteUrl: site.siteUrl,
          entityPathPattern,
          startDate: dateRanges.startDate,
          endDate: dateRanges.endDate,
          compareStartDate: dateRanges.compareStartDate,
          compareEndDate: dateRanges.compareEndDate,
        }),
      });
      if (entityResponse.ok) {
        const entityData = await entityResponse.json();
        if (entityData.success) {
          entityPagesData = entityData;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Compute entity coverage (sitemap URLs vs GSC)
  let entityCoverage: ReportDiscoveryData["entityCoverage"];
  if (wordPressContext.entitySitemapUrls.length > 0) {
    const urlsInGSC = new Set(
      (entityPagesData?.pages || []).map((p) => normalizePathForCompare(p.pagePath))
    );
    const notInGSC = wordPressContext.entitySitemapUrls.filter((url) => {
      try {
        const path = new URL(url).pathname;
        return !urlsInGSC.has(normalizePathForCompare(path));
      } catch {
        return true;
      }
    });
    const totalInSitemap = wordPressContext.entitySitemapUrls.length;
    const totalInGSC = urlsInGSC.size;
    entityCoverage = {
      totalInSitemap,
      totalInGSC,
      notInGSC: notInGSC.slice(0, 20), // Limit for display
      indexedPercent: totalInSitemap > 0 ? Math.round((totalInGSC / totalInSitemap) * 100) : 0,
    };
  }

  return {
    site,
    wordPressContext,
    stats,
    entityPagesData,
    historicalData,
    ga4Data: ga4Data ?? undefined,
    gmbData: gmbData ?? undefined,
    entityCoverage,
  };
}

function normalizePathForCompare(path: string): string {
  return path.replace(/\/$/, "").toLowerCase();
}

async function fetchWordPressContext(
  site: WordPressSite,
  onProgress?: (message: string) => void
): Promise<WordPressSiteContext> {
  const hasCredentials = !!(site.username && site.appPassword);

  let entitySitemapUrls: string[] = [];
  let postsCount = 0;
  let pagesCount = 0;
  const sampleTitles: string[] = [];

  if (hasCredentials) {
    try {
      if (site.entitySitemapUrl) {
        onProgress?.("Parsing entity sitemap...");
        const parseResult = await parseSitemap(
          site.siteUrl,
          site.entitySitemapUrl,
          site.username,
          site.appPassword
        );
        entitySitemapUrls = parseResult.urls || [];
      }

      onProgress?.("Fetching WordPress content counts...");
      const [postsResult, pagesResult] = await Promise.all([
        getPublishedPosts(site.siteUrl, site.username, site.appPassword, 50, 0),
        getPublishedPages(site.siteUrl, site.username, site.appPassword, 50, 0),
      ]);

      postsCount = postsResult.total ?? postsResult.posts?.length ?? 0;
      pagesCount = pagesResult.total ?? pagesResult.posts?.length ?? 0;

      // Sample titles for business inference
      const allTitles = [
        ...(postsResult.posts || []).slice(0, 10).map((p) => p.title || ""),
        ...(pagesResult.posts || []).slice(0, 10).map((p) => p.title || ""),
      ].filter(Boolean);
      sampleTitles.push(...allTitles);
    } catch (error) {
      console.warn("[Report Discovery] WordPress fetch failed:", error);
    }
  }

  const locationsCount = site.locations?.length ?? 0;
  const napInfo = site.napInfo
    ? {
        name: site.napInfo.name,
        address: site.napInfo.address,
        phone: site.napInfo.phone,
        email: site.napInfo.email,
      }
    : undefined;

  return {
    siteName: site.name,
    siteUrl: site.siteUrl,
    hasCredentials,
    napInfo,
    locationsCount,
    entitySitemapUrl: site.entitySitemapUrl,
    entitySitemapUrls,
    entitySitemapCount: entitySitemapUrls.length,
    postsCount,
    pagesCount,
    sampleTitles,
  };
}

async function fetchGSCPerformanceStats(
  apiBase: string,
  siteUrl: string,
  dateRanges: ReportDiscoveryDateRanges
): Promise<GSCPerformanceStats> {
  const response = await fetch(`${apiBase}/api/gsc/fetch-performance-stats`, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl,
      startDate: dateRanges.startDate,
      endDate: dateRanges.endDate,
      compareStartDate: dateRanges.compareStartDate,
      compareEndDate: dateRanges.compareEndDate,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || errorData.message || "Failed to fetch GSC stats");
  }

  const data = await response.json();
  if (!data.success || !data.stats) {
    throw new Error(data.error || "Failed to fetch GSC performance stats");
  }
  return data.stats;
}
