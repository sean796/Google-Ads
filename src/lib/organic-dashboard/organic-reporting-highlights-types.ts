import type { SanitizedDeckOpportunity } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";

export type OrganicDeckOpportunity = SanitizedDeckOpportunity;

export type OrganicReportingHighlights = {
  executiveSummary: string;
  keyTakeaways: string[];
  /** Client-facing GA4 + GSC narrative for the performance summary section (DeepSeek / report model). */
  performanceNarrative: string[];
  /** Keyword / query story for the keyword performance section (report model). */
  keywordNarrative: string[];
  /** Paid search narrative for the Google Ads account card in the client report. */
  googleAdsNarrative: string[];
  /** Local map grid overview when a saved Local Grid scan is on the latest report. */
  localGridNarrative: string[];
  topOpportunities: OrganicDeckOpportunity[];
};

export type OrganicReportingHighlightsSnapshotPeriodQuery = {
  query: string;
  clicks: string;
  impressions: string;
  avgPosition: string;
};

export type OrganicReportingHighlightsSnapshotCompareQuery = {
  query: string;
  earlierClicks: string;
  laterClicks: string;
  earlierImpressions: string;
  laterImpressions: string;
  avgPosition: string;
  clicksChangePercent: number | null;
  impressionsChangePercent: number | null;
};

export type OrganicReportingHighlightsSnapshotMonthlyTable = {
  title: string;
  monthLabels: string[];
  periodTotalColumnLabel: string;
  rows: Array<{ label: string; months: string[]; periodTotal: string }>;
};

export type OrganicReportingHighlightsSnapshot = {
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  reportStructure: "compare" | "period_progress";
  periods: {
    earlier: string;
    later: string;
  };
  ga4Rows: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }>;
  gscTotals: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  topQueries: Array<
    OrganicReportingHighlightsSnapshotCompareQuery | OrganicReportingHighlightsSnapshotPeriodQuery
  >;
  periodTotals?: {
    ga4: Array<{ label: string; value: string }>;
    gsc: Array<{ label: string; value: string }> | null;
    googleAds?: Array<{ label: string; value: string }> | null;
  };
  monthlyProgression?: {
    ga4: OrganicReportingHighlightsSnapshotMonthlyTable | null;
    gsc: OrganicReportingHighlightsSnapshotMonthlyTable | null;
  };
  googleAdsTotals?: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  /** Budget pacing caption for the Google Ads account card (when available). */
  googleAdsBudgetCaption?: string | null;
  semrushBrandedTotals?: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  localGrid?: LocalGridReportingSnapshot | null;
  leadsTotals?: Array<{ label: string; value: string }> | null;
  leadsRoiHeadline?: string | null;
};
