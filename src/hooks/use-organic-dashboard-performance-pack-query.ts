import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import { ORGANIC_DASHBOARD_QUERY_STALE_MS } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import {
  fetchOrganicDashboardPerformancePack,
  type OrganicDashboardPerformancePack,
} from "@/lib/organic-dashboard/organic-dashboard-performance-pack";

export function organicDashboardPerformancePackQueryKey(args: {
  siteId: string;
  fetchParams: OrganicDashboardFetchParams | null;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
  siteSemrushProjectDashboardUrl: string;
}) {
  return [
    "organic-dashboard-performance-pack",
    args.siteId,
    args.fetchParams,
    args.showCompare,
    args.siteDisplayName,
    args.sitePublicUrl,
    args.siteSemrushProjectDashboardUrl,
  ] as const;
}

export function useOrganicDashboardPerformancePackQuery(args: {
  siteId: string;
  fetchParams: OrganicDashboardFetchParams | null;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
  siteSemrushProjectDashboardUrl: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = organicDashboardPerformancePackQueryKey(args);

  return useQuery<OrganicDashboardPerformancePack>({
    queryKey,
    queryFn: ({ signal }) => {
      if (!args.fetchParams) {
        throw new Error("Invalid date range");
      }
      return fetchOrganicDashboardPerformancePack({
        fetchParams: args.fetchParams,
        siteId: args.siteId,
        siteDisplayName: args.siteDisplayName,
        sitePublicUrl: args.sitePublicUrl,
        showCompare: args.showCompare,
        siteSemrushProjectDashboardUrl: args.siteSemrushProjectDashboardUrl,
        signal,
        queryClient,
      });
    },
    enabled: args.enabled && args.fetchParams != null,
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
