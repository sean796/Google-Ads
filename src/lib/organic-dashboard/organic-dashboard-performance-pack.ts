import type { WordPressSite } from "@/components/integrations/types";
import { deckHighlightsNeedsAgentNarratives } from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  buildOrganicDashboardViewModel,
  type OrganicDashboardViewModel,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlights,
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
}): Promise<OrganicDashboardPerformancePack> {
  const bundle = await fetchOrganicDashboardBundle(args.fetchParams);
  const viewModel = buildOrganicDashboardViewModel(bundle, {
    showCompare: args.showCompare,
    siteSemrushProjectDashboardUrl: args.siteSemrushProjectDashboardUrl,
  });
  const snapshot = buildOrganicReportingHighlightsSnapshot(
    viewModel,
    args.siteDisplayName,
    args.sitePublicUrl,
    args.showCompare,
  );
  const highlights = await fetchOrganicReportingHighlights(
    snapshot,
    args.siteId,
    args.signal,
  );
  if (deckHighlightsNeedsAgentNarratives(highlights)) {
    throw new Error("Report narratives did not return complete content.");
  }
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
