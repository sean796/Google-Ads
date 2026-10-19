import type { WordPressSite } from "@/components/integrations/types";
import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";
import {
  resolveGa4PropertyIdForReporting,
  resolveGa4PropertyIdForReportingAsync,
} from "@/lib/ga4-reporting-property";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import { buildOrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlights,
  resolveClientReportHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  parseOrganicReportingShareParams,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";

function dateHarnessFromShare(parsed: OrganicReportingShareState): Ga4ReportingDateHarness {
  const { section: _section, ...harness } = parsed;
  return harness;
}

export async function hydrateOrganicClientReportFromShareSearch(
  site: WordPressSite,
  search: string,
): Promise<OrganicClientReportDeckPayload | null> {
  const parsed = parseOrganicReportingShareParams(search);
  if (!parsed || parsed.section !== "performance") return null;

  const dateHarness = dateHarnessFromShare(parsed);
  const ga4PropertyId =
    (await resolveGa4PropertyIdForReportingAsync(site)) || resolveGa4PropertyIdForReporting(site);
  const fetchParams = buildOrganicDashboardFetchParams(site, dateHarness, ga4PropertyId);
  if (!fetchParams) return null;

  const bundle = await fetchOrganicDashboardBundle(fetchParams);
  const showCompare = dateHarness.compareEnabled;
  const viewModel = buildOrganicDashboardViewModel(bundle, { showCompare });
  const siteName = site.name?.trim() || site.siteUrl.trim();
  const siteUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
  const snapshot = buildOrganicReportingHighlightsSnapshot(viewModel, siteName, siteUrl, showCompare);
  const fetched = await fetchOrganicReportingHighlights(snapshot, site.id);
  const highlights = resolveClientReportHighlights(fetched, siteName, viewModel);
  const preparedOn = formatLocalYmd(new Date());

  return {
    siteId: site.id,
    highlights,
    viewModel,
    siteName,
    siteUrl,
    showCompare,
    preparedOn,
  };
}
