import { useQuery } from "@tanstack/react-query";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  ORGANIC_DASHBOARD_QUERY_STALE_MS,
  organicReportingHighlightsQueryKey,
} from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";
import type { OrganicReportingHighlightsSnapshot } from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchLocalGridReportingNarrative,
  fetchOrganicReportingHighlightsForSnapshot,
  type OrganicReportingHighlights,
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
  localGridSnapshot?: LocalGridReportingSnapshot | null;
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
    args.localGridSnapshot ?? null,
  );
  return fetchOrganicReportingHighlightsForSnapshot(snapshot, args.siteId, signal);
}

export function localGridReportNarrativeQueryKey(args: {
  siteId: string;
  scanId: string | null | undefined;
}) {
  return ["local-grid-report-narrative", "v2", args.siteId, args.scanId ?? null] as const;
}

export function useLocalGridReportNarrativeQuery(args: {
  siteId: string;
  snapshot: OrganicReportingHighlightsSnapshot | null;
  highlights: OrganicReportingHighlights | undefined;
  enabled: boolean;
}) {
  const needsNarrative =
    Boolean(args.snapshot?.localGrid?.scanId) &&
    (args.highlights?.localGridNarrative.length ?? 0) === 0;

  return useQuery({
    queryKey: localGridReportNarrativeQueryKey({
      siteId: args.siteId,
      scanId: args.snapshot?.localGrid?.scanId,
    }),
    queryFn: ({ signal }) => {
      if (!args.snapshot) {
        throw new Error("Local grid snapshot is missing.");
      }
      return fetchLocalGridReportingNarrative(args.snapshot, args.siteId, signal);
    },
    enabled: args.enabled && needsNarrative,
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function mergeHighlightsWithLocalGridNarrative(
  highlights: OrganicReportingHighlights | undefined,
  supplemental: string[] | undefined,
): OrganicReportingHighlights | undefined {
  if (!highlights) return undefined;
  if (!supplemental || supplemental.length === 0) return highlights;
  if (highlights.localGridNarrative.length > 0) return highlights;
  return { ...highlights, localGridNarrative: supplemental };
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
    localGridScanId: args.localGridSnapshot?.scanId ?? null,
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
          localGridSnapshot: args.localGridSnapshot ?? null,
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
