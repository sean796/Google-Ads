import type { QueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import {
  resolveGa4PropertyIdForReporting,
  resolveGa4PropertyIdForReportingAsync,
} from "@/lib/ga4-reporting-property";
import {
  resolveGoogleAdsCustomerIdForReporting,
  resolveGoogleAdsCustomerIdForReportingAsync,
} from "@/lib/ads-reporting/ads-reporting-metrics";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import {
  buildOrganicDashboardFetchParams,
  resolveOrganicReportingDateHarnessFromSearch,
} from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import { resolveSemrushProjectDashboardUrlForSite } from "@/lib/semrush-project-id-defaults";

export const ORGANIC_DASHBOARD_QUERY_STALE_MS = 60_000;

export function organicDashboardBundleQueryKey(
  siteId: string,
  fetchParams: OrganicDashboardFetchParams,
) {
  return ["organic-dashboard-bundle", "v2", siteId, fetchParams] as const;
}

export function organicReportingHighlightsQueryKey(args: {
  siteId: string;
  fetchParams: OrganicDashboardFetchParams | null;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
}) {
  return [
    "organic-reporting-highlights",
    args.siteId,
    args.fetchParams,
    args.showCompare,
    args.siteDisplayName,
    args.sitePublicUrl,
  ] as const;
}

async function resolveReportingFetchParams(site: WordPressSite, search?: string) {
  const dateHarness =
    typeof window !== "undefined"
      ? resolveOrganicReportingDateHarnessFromSearch(search ?? window.location.search)
      : resolveOrganicReportingDateHarnessFromSearch("");
  const ga4PropertyId = await resolveGa4PropertyIdForReportingAsync(site).catch(
    () => resolveGa4PropertyIdForReporting(site),
  );
  const googleAdsCustomerId = await resolveGoogleAdsCustomerIdForReportingAsync(site).catch(
    () => resolveGoogleAdsCustomerIdForReporting(site),
  );
  const params = buildOrganicDashboardFetchParams(
    site,
    dateHarness,
    ga4PropertyId,
    googleAdsCustomerId,
  );
  if (!params) return null;
  return {
    params,
    showCompare: dateHarness.compareEnabled,
    googleAdsCustomerId,
  };
}

/** Warm GA4, GSC, Semrush, Google Ads bundle, and backend AI reporting highlights before Performance or Client Report paint. */
export function prefetchOrganicDashboardPerformancePack(
  queryClient: QueryClient,
  site: WordPressSite,
  search?: string,
): void {
  void (async () => {
    const resolved = await resolveReportingFetchParams(site, search);
    if (!resolved) return;
    const bundle = await queryClient.fetchQuery({
      queryKey: organicDashboardBundleQueryKey(site.id, resolved.params),
      queryFn: () => fetchOrganicDashboardBundle(resolved.params),
      staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    });
    const siteDisplayName = site.name?.trim() || site.siteUrl;
    const sitePublicUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
    const siteSemrushProjectDashboardUrl = resolveSemrushProjectDashboardUrlForSite(site);
    const highlightsKey = organicReportingHighlightsQueryKey({
      siteId: site.id,
      fetchParams: resolved.params,
      showCompare: resolved.showCompare,
      siteDisplayName,
      sitePublicUrl,
    });
    await queryClient.prefetchQuery({
      queryKey: highlightsKey,
      queryFn: ({ signal }) => {
        const viewModel = buildOrganicDashboardViewModel(bundle, {
          showCompare: resolved.showCompare,
          siteSemrushProjectDashboardUrl,
          googleAdsCustomerIdForReporting: resolved.googleAdsCustomerId,
        });
        const snapshot = buildOrganicReportingHighlightsSnapshot(
          viewModel,
          siteDisplayName,
          sitePublicUrl,
          resolved.showCompare,
        );
        return fetchOrganicReportingHighlights(snapshot, site.id, signal);
      },
      staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    });
  })().catch(() => {
    /* background prefetch only; active queries surface errors on screen */
  });
}

/** @deprecated Use prefetchOrganicDashboardPerformancePack; kept for existing call sites. */
export function prefetchOrganicDashboardBundle(
  queryClient: QueryClient,
  site: WordPressSite,
): void {
  prefetchOrganicDashboardPerformancePack(queryClient, site);
}
