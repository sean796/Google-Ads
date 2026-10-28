import type { QueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import { resolveGoogleAdsCustomerIdForReporting } from "@/lib/ads-reporting/ads-reporting-metrics";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import {
  ORGANIC_DASHBOARD_QUERY_STALE_MS,
  organicDashboardBundleQueryKey,
} from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  buildOrganicDashboardViewModel,
  type OrganicDashboardViewModel,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlightsForSnapshot,
  type OrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

export type OrganicDashboardPerformancePack = {
  bundle: OrganicDashboardBundleResponse;
  highlights: OrganicReportingHighlights;
  viewModel: OrganicDashboardViewModel;
};

export async function fetchOrganicDashboardPerformancePack(args: {
  fetchParams: OrganicDashboardFetchParams;
  siteId: string;
  siteDisplayName: string;
  sitePublicUrl: string;
  showCompare: boolean;
  siteSemrushProjectDashboardUrl?: string;
  signal?: AbortSignal;
  queryClient?: QueryClient;
}): Promise<OrganicDashboardPerformancePack> {
  const bundleKey = organicDashboardBundleQueryKey(args.siteId, args.fetchParams);
  const bundle = args.queryClient
    ? await args.queryClient.fetchQuery({
        queryKey: bundleKey,
        queryFn: () => fetchOrganicDashboardBundle(args.fetchParams),
        staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
      })
    : await fetchOrganicDashboardBundle(args.fetchParams);
  const viewModel = buildOrganicDashboardViewModel(bundle, {
    showCompare: args.showCompare,
    siteSemrushProjectDashboardUrl: args.siteSemrushProjectDashboardUrl,
    googleAdsCustomerIdForReporting: resolveGoogleAdsCustomerIdForReporting(args.site),
  });
  const snapshot = buildOrganicReportingHighlightsSnapshot(
    viewModel,
    args.siteDisplayName,
    args.sitePublicUrl,
    args.showCompare,
  );
  const highlights = await fetchOrganicReportingHighlightsForSnapshot(
    snapshot,
    args.siteId,
    args.signal,
  );
  return { bundle, highlights, viewModel };
}

export async function fetchOrganicDashboardPerformancePackForSite(args: {
  site: WordPressSite;
  fetchParams: OrganicDashboardFetchParams;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
  siteSemrushProjectDashboardUrl?: string;
  signal?: AbortSignal;
}): Promise<OrganicDashboardPerformancePack> {
  return fetchOrganicDashboardPerformancePack({
    fetchParams: args.fetchParams,
    siteId: args.site.id,
    siteDisplayName: args.siteDisplayName,
    sitePublicUrl: args.sitePublicUrl,
    showCompare: args.showCompare,
    siteSemrushProjectDashboardUrl: args.siteSemrushProjectDashboardUrl,
    signal: args.signal,
  });
}
