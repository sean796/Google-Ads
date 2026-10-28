import { useQuery } from "@tanstack/react-query";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import {
  ORGANIC_DASHBOARD_QUERY_STALE_MS,
  organicDashboardBundleQueryKey,
} from "@/lib/organic-dashboard/organic-dashboard-prefetch";

export function useOrganicDashboardBundleQuery(args: {
  siteId: string;
  fetchParams: OrganicDashboardFetchParams | null;
  enabled: boolean;
}) {
  const queryKey =
    args.fetchParams != null
      ? organicDashboardBundleQueryKey(args.siteId, args.fetchParams)
      : (["organic-dashboard-bundle", "v2", args.siteId, null] as const);

  return useQuery({
    queryKey,
    queryFn: () => {
      if (!args.fetchParams) {
        throw new Error("Invalid date range");
      }
      return fetchOrganicDashboardBundle(args.fetchParams);
    },
    enabled: args.enabled && args.fetchParams != null,
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
