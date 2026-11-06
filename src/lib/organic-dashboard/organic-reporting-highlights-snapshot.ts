import type { OrganicPeriodProgressTable } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { ORGANIC_GA4_DECK_LABELS } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type {
  OrganicReportingHighlights,
  OrganicReportingHighlightsSnapshot,
  OrganicReportingHighlightsSnapshotMonthlyTable,
  OrganicReportingHighlightsSnapshotPeriodQuery,
} from "./organic-reporting-highlights-types";

function serializePeriodProgressTableForSnapshot(
  table: OrganicPeriodProgressTable,
): OrganicReportingHighlightsSnapshotMonthlyTable {
  return {
    title: table.title,
    monthLabels: table.monthLabels,
    periodTotalColumnLabel: table.periodTotalColumnLabel,
    rows: table.rows.map((row) => ({
      label: row.label,
      months: row.values,
      periodTotal: row.periodTotal,
    })),
  };
}

function buildGoogleAdsSnapshotTotals(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): OrganicReportingHighlightsSnapshot["googleAdsTotals"] {
  if (!viewModel.hasGoogleAds || !viewModel.googleAdsSummary) return null;
  const s = viewModel.googleAdsSummary;
  const rows = [
    {
      label: "Leads (Google Ads)",
      earlier: s.compareLeads,
      later: s.leads,
      changePercent: showCompare ? s.leadsDelta.deltaPercent : null,
    },
    {
      label: "Cost per lead (Google Ads)",
      earlier: s.compareCostPerLead,
      later: s.costPerLead,
      changePercent: showCompare ? s.costPerLeadDelta.deltaPercent : null,
    },
    {
      label: "Spend (Google Ads)",
      earlier: s.compareSpend,
      later: s.spend,
      changePercent: showCompare ? s.spendDelta.deltaPercent : null,
    },
    {
      label: "Clicks (Google Ads)",
      earlier: s.compareClicks,
      later: s.clicks,
      changePercent: showCompare ? s.clicksDelta.deltaPercent : null,
    },
  ];
  return rows;
}

function buildSemrushBrandedSnapshotTotals(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): OrganicReportingHighlightsSnapshot["semrushBrandedTotals"] {
  const s = viewModel.semrushSummary;
  if (!s?.hasBrandedMetrics) return null;
  return [
    {
      label: "Branded traffic (Semrush est.)",
      earlier: showCompare ? s.compareBrandedTraffic : "n/a",
      later: s.brandedTraffic,
      changePercent: showCompare ? s.brandedDelta.deltaPercent : null,
    },
    {
      label: "Non-branded traffic (Semrush est.)",
      earlier: showCompare ? s.compareNonBrandedTraffic : "n/a",
      later: s.nonBrandedTraffic,
      changePercent: showCompare ? s.nonBrandedDelta.deltaPercent : null,
    },
  ];
}

export function buildOrganicReportingHighlightsSnapshot(
  viewModel: OrganicDashboardViewModel,
  siteName: string,
  siteUrl: string,
  showCompare: boolean,
  localGrid?: LocalGridReportingSnapshot | null,
): OrganicReportingHighlightsSnapshot {
  const semrushBrandedTotals = buildSemrushBrandedSnapshotTotals(viewModel, showCompare);
  const localGridBlock = localGrid ?? null;
  const ga4Rows = viewModel.ga4Table
    .filter((row) => ORGANIC_GA4_DECK_LABELS.has(row.label))
    .map((row) => ({
      label: row.label,
      earlier: row.previous,
      later: row.current,
      changePercent: row.delta.deltaPercent,
    }));

  const gsc = viewModel.gscSummary;
  const gscTotals = gsc
    ? [
        {
          label: "Total clicks (GSC)",
          earlier: gsc.compareClicks,
          later: gsc.clicks,
          changePercent: gsc.clicksDelta.deltaPercent,
        },
        {
          label: "Total impressions (GSC)",
          earlier: gsc.compareImpressions,
          later: gsc.impressions,
          changePercent: gsc.impressionsDelta.deltaPercent,
        },
        {
          label: "Average CTR (GSC)",
          earlier: gsc.compareCtr,
          later: gsc.ctr,
          changePercent: gsc.ctrDelta.deltaPercent,
        },
        {
          label: "Average position (GSC)",
          earlier: gsc.compareAvgPosition,
          later: gsc.avgPosition,
          changePercent: gsc.positionDelta.deltaPercent,
        },
      ]
    : null;

  const reportStructure =
    viewModel.reportStructure === "period_progress" || !showCompare ? "period_progress" : "compare";
  const googleAdsTotalsRaw = buildGoogleAdsSnapshotTotals(viewModel, showCompare);

  if (reportStructure === "period_progress") {
    const topQueriesPeriod: OrganicReportingHighlightsSnapshotPeriodQuery[] = viewModel.gscQueries
      .slice(0, 10)
      .map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        avgPosition: q.position,
      }));

    const tables = viewModel.periodProgressTables;
    const monthlyProgression = tables
      ? {
          ga4: tables.ga4 ? serializePeriodProgressTableForSnapshot(tables.ga4) : null,
          gsc: tables.gsc ? serializePeriodProgressTableForSnapshot(tables.gsc) : null,
        }
      : undefined;

    return {
      siteName,
      siteUrl,
      showCompare: false,
      reportStructure: "period_progress",
      semrushBrandedTotals,
      localGrid: localGridBlock,
      periods: {
        earlier: "",
        later: viewModel.periodLabels.primary,
      },
      ga4Rows: ga4Rows.map((row) => ({
        ...row,
        earlier: "n/a",
        changePercent: null,
      })),
      gscTotals: gscTotals
        ? gscTotals.map((row) => ({
            ...row,
            earlier: "n/a",
            changePercent: null,
          }))
        : null,
      topQueries: topQueriesPeriod,
      periodTotals: {
        ga4: ga4Rows.map((row) => ({ label: row.label, value: row.later })),
        gsc: gscTotals ? gscTotals.map((row) => ({ label: row.label, value: row.later })) : null,
        googleAds: googleAdsTotalsRaw
          ? googleAdsTotalsRaw.map((row) => ({ label: row.label, value: row.later }))
          : null,
      },
      monthlyProgression,
      googleAdsTotals: googleAdsTotalsRaw
        ? googleAdsTotalsRaw.map((row) => ({
            ...row,
            earlier: "n/a",
            changePercent: null,
          }))
        : null,
      googleAdsBudgetCaption: viewModel.googleAdsBudgetPacing?.caption ?? null,
      leadsTotals: null,
      leadsRoiHeadline: null,
    };
  }

  const topQueries = viewModel.gscQueries.slice(0, 10).map((q) => ({
    query: q.query,
    earlierClicks: q.previousClicks,
    laterClicks: q.clicks,
    earlierImpressions: q.previousImpressions,
    laterImpressions: q.impressions,
    avgPosition: q.position,
    clicksChangePercent: q.clicksDelta.deltaPercent,
    impressionsChangePercent: q.impressionsDelta.deltaPercent,
  }));

  return {
    siteName,
    siteUrl,
    showCompare: true,
    reportStructure: "compare",
    periods: {
      earlier: viewModel.periodLabels.compare,
      later: viewModel.periodLabels.primary,
    },
    ga4Rows,
    gscTotals,
    topQueries,
    googleAdsTotals: googleAdsTotalsRaw,
    googleAdsBudgetCaption: viewModel.googleAdsBudgetPacing?.caption ?? null,
    semrushBrandedTotals,
    localGrid: localGridBlock,
    leadsTotals: null,
    leadsRoiHeadline: null,
  };
}

/** Clean client-facing summary while the report agent finishes (no internal status jargon). */
export function buildPlaceholderOrganicReportingHighlights(
  siteName: string,
  viewModel?: OrganicDashboardViewModel,
): OrganicReportingHighlights {
  const name = siteName.trim() || "This site";
  const takeaways: string[] = [];
  const sessionsRow = viewModel?.ga4Table.find((r) => r.label === "Organic Search sessions");
  if (sessionsRow && sessionsRow.current !== "—") {
    takeaways.push(
      `GA4 Organic Search recorded ${sessionsRow.current} sessions in ${viewModel?.periodLabels.primary ?? "the primary period"}.`,
    );
  }
  if (viewModel?.gscSummary) {
    takeaways.push(
      `Google Search Console recorded ${viewModel.gscSummary.clicks} clicks and ${viewModel.gscSummary.impressions} impressions (${viewModel.gscSummary.ctr} CTR, avg. position ${viewModel.gscSummary.avgPosition}).`,
    );
  }
  if (takeaways.length < 2) {
    takeaways.push(
      "Headline GA4 organic traffic and Google Search Console visibility metrics are summarized in the tables below.",
      "Top organic search queries and search visibility metrics are detailed by section.",
    );
  }
  const hasSemrush = Boolean(
    viewModel?.hasSemrush && viewModel.semrushKeywords && viewModel.semrushKeywords.length > 0,
  );
  const channelText = hasSemrush
    ? "GA4, Google Search Console, and Semrush"
    : "GA4 and Google Search Console";
  return {
    executiveSummary: `${name} organic search performance summary across ${channelText}.`,
    keyTakeaways: takeaways.slice(0, 4),
    performanceNarrative: [],
    keywordNarrative: [],
    googleAdsNarrative: [],
    localGridNarrative: [],
    topOpportunities: [],
  };
}

export function resolveClientReportHighlights(
  cached: OrganicReportingHighlights | undefined,
  siteName: string,
  viewModel?: OrganicDashboardViewModel,
): OrganicReportingHighlights {
  if (cached) {
    return cached;
  }
  return buildPlaceholderOrganicReportingHighlights(siteName, viewModel);
}
