import {
  normalizeOrganicReportingHighlights,
  type OrganicDeckOpportunity,
  type OrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { LocalGridScanDocument } from "@/lib/local-grid-studio/local-grid-types";
import { buildLocalGridClientReportSection } from "@/lib/organic-dashboard/local-grid-client-report";
import { resolveLocalGridNarrativeForReport } from "@/lib/organic-dashboard/local-grid-report-narrative";
import type { LocalGridClientReportSection } from "@/lib/organic-dashboard/local-grid-client-report";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildGoogleAdsReportAccountCard,
} from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import {
  buildGoogleAdsDeckSummaryRows,
  buildHeadlineSummaryRows,
  buildSemrushDeckSummaryRows,
  deriveKeyTakeawaysFromSummary,
  filterHighlightsTakeaways,
  isNonExistentSectionOmissionStatement,
  pickDeckHighlightStats,
  sanitizeExecutiveSummaryText,
  splitHeadlineSummaryRows,
  type DeckHighlightStat,
  type DeckSummaryRow,
  type SectionExistenceFilterOptions,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import {
  clientReportSemrushKeywordHasTraffic,
  formatClientReportPeriodLine,
  normalizeClientReportPeriodLabel,
  normalizeClientReportText,
  sanitizeClientReportMetricValue,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { parseDeckCountDisplay } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { partitionClientReportOpportunities } from "@/lib/organic-dashboard/organic-client-report-opportunities";
import type { OrganicPeriodProgressTables } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import { resolveAgencyReportLogoUrl } from "@/lib/organic-dashboard/organic-client-report-branding";

export const EMPTY_CLIENT_REPORT_HIGHLIGHTS: OrganicReportingHighlights = {
  executiveSummary: "",
  keyTakeaways: [],
  performanceNarrative: [],
  keywordNarrative: [],
  googleAdsNarrative: [],
  localGridNarrative: [],
  topOpportunities: [],
};

export type OrganicClientReportDeckInput = {
  viewModel: OrganicDashboardViewModel;
  /** When omitted, PDF still includes GA4, GSC, Semrush, and Google Ads from the view model. */
  highlights?: OrganicReportingHighlights;
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  preparedOn: string;
  localGridScan?: LocalGridScanDocument | null;
  clientLogoUrl?: string;
  agencyLogoUrl?: string;
  clientLogoBoxTheme?: "black" | "white";
};

export type OrganicClientReportDocumentProps = OrganicClientReportDeckInput;

export type OrganicClientReportKeywordRow = { query: string; clicks: string };

export type OrganicClientReportSemrushKeywordRow = {
  phrase: string;
  traffic: string;
  volume: string;
};

export type OrganicClientReportContent = {
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  preparedOn: string;
  clientLogoUrl: string;
  clientLogoBoxTheme: "black" | "white";
  agencyLogoUrl: string;
  periodLine: string;
  comparePeriodLabel: string;
  primaryPeriodLabel: string;
  highlights: OrganicReportingHighlights;
  summaryRows: DeckSummaryRow[];
  traffic: DeckSummaryRow[];
  search: DeckSummaryRow[];
  highlightStats: DeckHighlightStat[];
  topQueries: OrganicClientReportKeywordRow[];
  semrushDeckRows: DeckSummaryRow[];
  topSemrushKeywords: OrganicClientReportSemrushKeywordRow[];
  opportunities: OrganicDeckOpportunity[];
  googleAdsOpportunities: OrganicDeckOpportunity[];
  hasSemrush: boolean;
  semrushDatabase: string;
  semrushOverviewUrl: string;
  semrushDomain: string;
  performanceNarrative: string[];
  keywordNarrative: string[];
  googleAdsDeckRows: DeckSummaryRow[];
  googleAdsAccountCard: ReturnType<typeof buildGoogleAdsReportAccountCard> | null;
  googleAdsNarrative: string[];
  showPerformanceSection: boolean;
  showGoogleAdsSection: boolean;
  googleAdsLoadError: string | null;
  showSemrushSection: boolean;
  showKeywordSection: boolean;
  showHighlightsSection: boolean;
  showLocalGridSection: boolean;
  localGridSection: LocalGridClientReportSection | null;
  localGridNarrative: string[];
  periodProgressTables: OrganicPeriodProgressTables | null;
};

function sanitizeSummaryRows(rows: DeckSummaryRow[]): DeckSummaryRow[] {
  return rows.map((row) => ({
    ...row,
    label: normalizeClientReportText(row.label),
    earlier: sanitizeClientReportMetricValue(row.earlier),
    later: sanitizeClientReportMetricValue(row.later),
  }));
}

function sanitizeHighlightsForClientReport(
  highlights: OrganicReportingHighlights,
  options?: SectionExistenceFilterOptions,
): OrganicReportingHighlights {
  const cleanSummary = sanitizeExecutiveSummaryText(highlights.executiveSummary, options);
  let cleanTakeaways = filterHighlightsTakeaways(highlights.keyTakeaways, options).map((line) =>
    normalizeClientReportText(line),
  );
  if (cleanTakeaways.length < 2) {
    const derived = deriveKeyTakeawaysFromSummary(cleanSummary).takeaways;
    const filteredDerived = filterHighlightsTakeaways(derived, options);
    for (const d of filteredDerived) {
      if (cleanTakeaways.length < 2 && !cleanTakeaways.includes(d)) {
        cleanTakeaways.push(d);
      }
    }
  }
  while (cleanTakeaways.length < 2) {
    cleanTakeaways.push("See performance summary and highlights below for detail.");
  }

  const performanceNarrative = (highlights.performanceNarrative ?? [])
    .filter((p) => !isNonExistentSectionOmissionStatement(p))
    .map((p) => normalizeClientReportText(p));
  const keywordNarrative = (highlights.keywordNarrative ?? [])
    .filter((p) => !isNonExistentSectionOmissionStatement(p))
    .map((p) => normalizeClientReportText(p));
  const googleAdsNarrative =
    options?.hasGoogleAds === false
      ? []
      : (highlights.googleAdsNarrative ?? [])
          .filter((p) => !isNonExistentSectionOmissionStatement(p))
          .map((p) => normalizeClientReportText(p));
  const localGridNarrative =
    options?.hasLocalGrid === false
      ? []
      : (highlights.localGridNarrative ?? [])
          .filter((p) => !isNonExistentSectionOmissionStatement(p))
          .map((p) => normalizeClientReportText(p));

  return {
    ...highlights,
    executiveSummary: normalizeClientReportText(cleanSummary),
    keyTakeaways: cleanTakeaways,
    performanceNarrative,
    keywordNarrative,
    googleAdsNarrative,
    localGridNarrative,
    topOpportunities: highlights.topOpportunities
      .filter((item) => {
        if (options?.hasGoogleAds === false && /\(google ads\)/i.test(item.label || "")) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        label: normalizeClientReportText(item.label),
        why: normalizeClientReportText(item.why),
        metrics: normalizeClientReportText(item.metrics),
        comparisonRows: item.comparisonRows.map((row) => ({
          ...row,
          metric: normalizeClientReportText(row.metric),
          comparePeriodValue: sanitizeClientReportMetricValue(row.comparePeriodValue),
          primaryPeriodValue: sanitizeClientReportMetricValue(row.primaryPeriodValue),
        })),
      })),
  };
}

export function buildOrganicClientReportContent(input: OrganicClientReportDeckInput): OrganicClientReportContent {
  const {
    viewModel,
    highlights,
    siteName,
    siteUrl,
    showCompare,
    preparedOn,
    localGridScan,
    clientLogoUrl: clientLogoInput,
    agencyLogoUrl: agencyLogoInput,
  } = input;
  const clientLogoUrl = clientLogoInput?.trim() ?? "";
  const agencyLogoUrl = agencyLogoInput?.trim() || resolveAgencyReportLogoUrl();

  const normalized = normalizeOrganicReportingHighlights(highlights) ?? EMPTY_CLIENT_REPORT_HIGHLIGHTS;

  const summaryRows = sanitizeSummaryRows(buildHeadlineSummaryRows(viewModel, showCompare));
  const { traffic, search } = splitHeadlineSummaryRows(summaryRows);
  const highlightStats = pickDeckHighlightStats(viewModel, showCompare).map((stat) => ({
    ...stat,
    label: normalizeClientReportText(stat.label),
    value: sanitizeClientReportMetricValue(stat.value),
  }));
  const topQueries = viewModel.gscQueries.slice(0, 5).map((q) => ({
    query: q.query,
    clicks: sanitizeClientReportMetricValue(q.clicks),
  }));
  const googleAdsDeckRows = sanitizeSummaryRows(buildGoogleAdsDeckSummaryRows(viewModel, showCompare));
  const semrushDeckRows = sanitizeSummaryRows(buildSemrushDeckSummaryRows(viewModel, showCompare));
  const topSemrushKeywords = viewModel.semrushKeywords
    .filter((k) => {
      const traffic = sanitizeClientReportMetricValue(k.traffic);
      if (!clientReportSemrushKeywordHasTraffic(traffic)) return false;
      return parseDeckCountDisplay(traffic) > 0;
    })
    .slice(0, 5)
    .map((k) => ({
      phrase: k.phrase,
      traffic: sanitizeClientReportMetricValue(k.traffic),
      volume: sanitizeClientReportMetricValue(k.volume),
    }));

  const localGridSection = buildLocalGridClientReportSection(localGridScan);
  const showLocalGridSection = localGridSection != null;
  const showSemrushSection =
    viewModel.hasSemrush && (semrushDeckRows.length > 0 || topSemrushKeywords.length > 0);
  const hasGoogleAds =
    viewModel.hasGoogleAds &&
    (viewModel.googleAdsSummary != null ||
      googleAdsDeckRows.length > 0 ||
      (normalized.googleAdsNarrative && normalized.googleAdsNarrative.length > 0));

  const clientHighlights = sanitizeHighlightsForClientReport(normalized, {
    siteName,
    hasGoogleAds,
    hasSemrush: showSemrushSection,
    hasLocalGrid: showLocalGridSection,
  });
  const partitioned = partitionClientReportOpportunities(clientHighlights.topOpportunities);
  const opportunities = partitioned.seoOpportunities.slice(0, 4);
  const googleAdsOpportunities = partitioned.googleAdsOpportunities.slice(0, 4);
  const comparePeriodLabel = normalizeClientReportPeriodLabel(viewModel.periodLabels.compare);
  const primaryPeriodLabel = normalizeClientReportPeriodLabel(viewModel.periodLabels.primary);
  const performanceNarrative = (clientHighlights.performanceNarrative ?? []).slice(0, 1);
  const keywordNarrative = (clientHighlights.keywordNarrative ?? []).slice(0, 1);
  const googleAdsNarrative = clientHighlights.googleAdsNarrative ?? [];
  const localGridNarrative = localGridSection
    ? resolveLocalGridNarrativeForReport(
        clientHighlights.localGridNarrative ?? [],
        localGridSection.snapshot,
        siteName,
      )
    : [];
  const googleAdsAccountCard =
    viewModel.hasGoogleAds && viewModel.googleAdsSummary
      ? buildGoogleAdsReportAccountCard({
          siteName,
          summary: viewModel.googleAdsSummary,
          tableRows: viewModel.googleAdsTable,
          chartPoints: viewModel.googleAdsDailyChart,
          budgetPacing: viewModel.googleAdsBudgetPacing,
          preparedOn,
          showCompare,
        })
      : null;

  const periodLine = formatClientReportPeriodLine(showCompare, comparePeriodLabel, primaryPeriodLabel);

  return {
    siteName,
    siteUrl,
    showCompare,
    preparedOn,
    clientLogoUrl,
    clientLogoBoxTheme: input.clientLogoBoxTheme ?? "black",
    agencyLogoUrl,
    periodLine,
    comparePeriodLabel,
    primaryPeriodLabel,
    highlights: clientHighlights,
    summaryRows,
    traffic,
    search,
    highlightStats,
    topQueries,
    semrushDeckRows,
    topSemrushKeywords,
    opportunities,
    googleAdsOpportunities,
    hasSemrush: viewModel.hasSemrush,
    semrushDatabase: viewModel.semrushDatabase,
    semrushOverviewUrl: viewModel.semrushOverviewUrl,
    semrushDomain: viewModel.semrushDomain,
    performanceNarrative,
    keywordNarrative,
    googleAdsDeckRows,
    googleAdsAccountCard,
    googleAdsNarrative,
    showPerformanceSection: summaryRows.length > 0,
    showGoogleAdsSection:
      viewModel.hasGoogleAds &&
      (googleAdsAccountCard != null ||
        googleAdsDeckRows.length > 0 ||
        googleAdsNarrative.length > 0 ||
        googleAdsOpportunities.length > 0),
    googleAdsLoadError: viewModel.googleAdsLoadError,
    showSemrushSection,
    showKeywordSection: topQueries.length > 0,
    showHighlightsSection: highlightStats.length > 0 || opportunities.length > 0,
    showLocalGridSection: localGridSection != null,
    localGridSection,
    localGridNarrative,
    periodProgressTables: viewModel.periodProgressTables,
  };
}
