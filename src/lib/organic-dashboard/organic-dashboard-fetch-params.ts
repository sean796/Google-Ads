import type { WordPressSite } from "@/components/integrations/types";
import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import { buildGa4ReportingRanges } from "@/lib/reporting/ga4-analytics-date-ranges";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { resolveSemrushDatabaseForSite } from "@/lib/organic-dashboard/resolve-semrush-database-for-site";
import { resolveGoogleAdsCustomerIdForReporting } from "@/lib/ads-reporting/ads-reporting-metrics";
import { resolveSemrushProjectIdForSite } from "@/lib/semrush-project-id-defaults";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  parseOrganicReportingShareParams,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { readOrganicDashboardDateSession } from "@/lib/organic-dashboard/organic-dashboard-date-session";
import {
  validateReportingCompareFetchRanges,
  validateReportingPrimaryFetchRange,
} from "@/lib/reporting/reporting-date-presets";

function dateHarnessFromShare(parsed: OrganicReportingShareState): Ga4ReportingDateHarness {
  const { section: _section, ...harness } = parsed;
  return harness;
}

/** Recompute compareRangeDraft from preset/baseline as of reference (rolling share links). */
export function refreshOrganicReportingDateHarness(
  harness: Ga4ReportingDateHarness,
  reference: Date = new Date(),
): Ga4ReportingDateHarness {
  if (harness.primaryPreset === "custom") {
    return harness;
  }
  const compareRangeDraft = buildGa4ReportingRanges({
    primaryPreset: harness.primaryPreset,
    primaryCustom: harness.compareRangeDraft.primary,
    compareEnabled: harness.compareEnabled,
    compareBaseline: harness.compareBaseline,
    compareCustom: harness.compareRangeDraft.compare,
    reference,
  });
  return { ...harness, compareRangeDraft };
}

function defaultOrganicReportingDateHarnessFallback(): Ga4ReportingDateHarness {
  return {
    primaryPreset: "last_30",
    compareBaseline: "previous_period",
    compareEnabled: true,
    compareRangeDraft: buildGa4ReportingRanges({
      primaryPreset: "last_30",
      primaryCustom: { startDate: "", endDate: "" },
      compareEnabled: true,
      compareBaseline: "previous_period",
      compareCustom: { startDate: "", endDate: "" },
    }),
  };
}

/** URL search (with or without leading ?), then session, then last-30 compare default. */
export function resolveOrganicReportingDateHarnessFromSearch(search: string): Ga4ReportingDateHarness {
  const normalized = search.startsWith("?") ? search : search ? `?${search}` : "";
  const fromUrl = normalized ? parseOrganicReportingShareParams(normalized) : null;
  if (fromUrl) return refreshOrganicReportingDateHarness(dateHarnessFromShare(fromUrl));
  const stored = readOrganicDashboardDateSession();
  if (stored) return refreshOrganicReportingDateHarness(stored);
  return defaultOrganicReportingDateHarnessFallback();
}

export function defaultOrganicReportingDateHarness(): Ga4ReportingDateHarness {
  if (typeof window !== "undefined") {
    return resolveOrganicReportingDateHarnessFromSearch(window.location.search);
  }
  return defaultOrganicReportingDateHarnessFallback();
}

export function buildOrganicDashboardFetchParams(
  site: WordPressSite,
  dateHarness: Ga4ReportingDateHarness,
  ga4PropertyId: string,
  googleAdsCustomerIdOverride?: string,
): OrganicDashboardFetchParams | null {
  const siteUrl = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
  if (!siteUrl) return null;

  const showCompare = dateHarness.compareEnabled;
  const resolvedRanges = buildGa4ReportingRanges({
    primaryPreset: dateHarness.primaryPreset,
    primaryCustom: dateHarness.compareRangeDraft.primary,
    compareEnabled: showCompare,
    compareBaseline: dateHarness.compareBaseline,
    compareCustom: dateHarness.compareRangeDraft.compare,
  });
  const primary = resolvedRanges.primary;
  const compare = resolvedRanges.compare;
  const rangesValid = showCompare
    ? validateReportingCompareFetchRanges(primary, compare).ok
    : validateReportingPrimaryFetchRange(primary).ok;
  if (!rangesValid) return null;

  const semrushProjectId = resolveSemrushProjectIdForSite(site);
  const googleAdsCustomerId =
    googleAdsCustomerIdOverride !== undefined
      ? googleAdsCustomerIdOverride.replace(/\D/g, "")
      : resolveGoogleAdsCustomerIdForReporting(site);
  return {
    siteUrl,
    ga4PropertyId,
    ...(googleAdsCustomerId.length === 10 ? { googleAdsCustomerId } : {}),
    semrushDatabase: resolveSemrushDatabaseForSite(site),
    ...(semrushProjectId ? { semrushProjectId } : {}),
    reportStructure: showCompare ? "compare" : "period_progress",
    startDate: primary.startDate,
    endDate: primary.endDate,
    compareStartDate: showCompare ? compare.startDate : primary.startDate,
    compareEndDate: showCompare ? compare.endDate : primary.endDate,
  };
}
