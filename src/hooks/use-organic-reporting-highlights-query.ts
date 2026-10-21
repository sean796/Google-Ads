import { useQuery } from "@tanstack/react-query";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  ORGANIC_DASHBOARD_QUERY_STALE_MS,
  organicReportingHighlightsQueryKey,
} from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicReportingHighlights } from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";

export { organicReportingHighlightsQueryKey };

export type UseOrganicReportingHighlightsQueryArgs = {
  siteId: string;
  bundle: OrganicDashboardBundleResponse | undefined;
  fetchParams: OrganicDashboardFetchParams | null;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
  googleAdsCustomerIdForReporting?: string;
  enabled: boolean;
};

export async function runOrganicReportingHighlightsQuery(
  args: Omit<UseOrganicReportingHighlightsQueryArgs, "enabled"> & {
    bundle: OrganicDashboardBundleResponse;
  },
  signal?: AbortSignal,
): Promise<OrganicReportingHighlights> {
  const viewModel = buildOrganicDashboardViewModel(args.bundle, {
    showCompare: args.showCompare,
    googleAdsCustomerIdForReporting: args.googleAdsCustomerIdForReporting,
  });
  const snapshot = buildOrganicReportingHighlightsSnapshot(
    viewModel,
    args.siteDisplayName,
    args.sitePublicUrl,
    args.showCompare,
  );
  return fetchOrganicReportingHighlights(snapshot, args.siteId, signal);
}

export function useOrganicReportingHighlightsQuery(args: UseOrganicReportingHighlightsQueryArgs) {
  const {
    siteId,
    bundle,
    fetchParams,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
    enabled,
  } = args;

  const queryKey = organicReportingHighlightsQueryKey({
    siteId,
    fetchParams,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
  });

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!bundle) {
        throw new Error("Performance data is missing.");
      }
      return runOrganicReportingHighlightsQuery(
        {
          siteId,
          bundle,
          fetchParams,
          showCompare,
          siteDisplayName,
          sitePublicUrl,
          googleAdsCustomerIdForReporting: args.googleAdsCustomerIdForReporting,
        },
        signal,
      );
    },
    enabled: enabled && fetchParams != null && bundle != null,
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
