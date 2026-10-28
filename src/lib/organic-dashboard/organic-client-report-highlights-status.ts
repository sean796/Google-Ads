import type { OrganicReportingHighlights } from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";

export type ClientReportDeckHighlightsStatusOptions = {
  /** Latest saved Local Grid scan is on the report. */
  hasLocalGrid?: boolean;
};

export function clientReportDeckNeedsAgentHighlights(
  highlights: OrganicReportingHighlights,
  viewModel: Pick<OrganicDashboardViewModel, "hasGoogleAds">,
  options?: ClientReportDeckHighlightsStatusOptions,
): boolean {
  if (highlights.performanceNarrative.length === 0) return true;
  if (highlights.keywordNarrative.length === 0) return true;
  if (highlights.topOpportunities.length === 0) return true;
  if (viewModel.hasGoogleAds && highlights.googleAdsNarrative.length === 0) return true;
  if (options?.hasLocalGrid && highlights.localGridNarrative.length === 0) return true;
  return false;
}
