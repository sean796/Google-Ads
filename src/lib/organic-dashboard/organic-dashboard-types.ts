import type { GA4ReportData } from "@/components/integrations/types";

export type OrganicDashboardSourceStatus = "ok" | "skipped" | "error";

export type OrganicDashboardSkippedBlock = {
  skipped: true;
  reason: string;
  error?: string;
  client_email?: string;
  serviceAccountEmail?: string;
};

export type OrganicDashboardGscPeriod = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  pagesCount?: number;
  searchTermsCount?: number;
};

export type OrganicDashboardGscTimeseriesPoint = {
  date: string;
  clicks: number;
  impressions: number;
  avgPosition: number;
};

export type OrganicDashboardGscStats = {
  success?: boolean;
  property?: string;
  timeseries?: OrganicDashboardGscTimeseriesPoint[];
  stats?: {
    currentPeriod: OrganicDashboardGscPeriod;
    comparisonPeriod: OrganicDashboardGscPeriod;
    comparisons: Record<string, number>;
    topKeywords: Array<{
      query: string;
      currentRanking: number;
      previousRanking: number;
      rankingChange: number;
      currentClicks: number;
      previousClicks: number;
      clicksChange: number;
      currentImpressions: number;
      previousImpressions: number;
      impressionsChange: number;
    }>;
  };
};

export type OrganicDashboardGscHistorical = {
  success?: boolean;
  monthlyStats?: Array<{
    month: string;
    clicks: number;
    impressions: number;
    avgPosition: number;
  }>;
};

export type OrganicDashboardSemrushMetrics = {
  organicKeywords?: number | null;
  organicTraffic?: number | null;
  trafficCost?: number | null;
  brandedTraffic?: number | null;
  nonBrandedTraffic?: number | null;
};

export type OrganicDashboardSemrushHistoryPoint = {
  month: string;
  organicTraffic?: number | null;
  organicKeywords?: number | null;
  trafficCost?: number | null;
};

export type OrganicDashboardSemrushKeyword = {
  phrase: string;
  volume?: number | null;
  traffic?: number | null;
  position?: number | null;
};

export type OrganicDashboardGoogleAdsDailyPoint = {
  date: string;
  costMicros: number;
  conversions: number;
  clicks: number;
};

export type OrganicDashboardGoogleAdsSuccess = {
  success?: true;
  customerId?: string;
  currencyCode?: string;
  account?: {
    impressions?: number;
    clicks?: number;
    costMicros?: number;
    conversions?: number;
    ctr?: number;
    averageCpc?: number;
  };
  compareAccount?: {
    impressions?: number;
    clicks?: number;
    costMicros?: number;
    conversions?: number;
    ctr?: number;
    averageCpc?: number;
  };
  dailySeries?: OrganicDashboardGoogleAdsDailyPoint[];
  budgetPacing?: {
    spendMicros: number;
    budgetMicros: number;
    periodStart: string;
    periodEnd: string;
  };
};

export type OrganicDashboardGoogleAdsPayload =
  | OrganicDashboardGoogleAdsSuccess
  | OrganicDashboardSkippedBlock;

export type OrganicDashboardSemrushStats = {
  success?: boolean;
  database?: string;
  domain?: string;
  overviewUrl?: string;
  current?: OrganicDashboardSemrushMetrics | null;
  compare?: OrganicDashboardSemrushMetrics | null;
  comparisons?: {
    keywordsChangePercent?: number | null;
    trafficChangePercent?: number | null;
    trafficCostChangePercent?: number | null;
  };
  history?: OrganicDashboardSemrushHistoryPoint[];
  topKeywords?: OrganicDashboardSemrushKeyword[];
  errors?: Array<{ step: string; message: string }>;
};

export type OrganicDashboardBundleResponse = {
  success: boolean;
  error?: string;
  meta?: {
    fetchedAt: string;
    primary: { startDate: string; endDate: string };
    compare: { startDate: string; endDate: string } | null;
    reportStructure?: "compare" | "period_progress";
    gscProperty?: string | null;
    ga4PropertyId?: string | null;
    googleAdsCustomerId?: string | null;
  };
  ga4?: GA4ReportData | OrganicDashboardSkippedBlock;
  gsc?: OrganicDashboardGscStats | OrganicDashboardSkippedBlock;
  gscHistorical?: OrganicDashboardGscHistorical | OrganicDashboardSkippedBlock;
  semrush?: OrganicDashboardSemrushStats | OrganicDashboardSkippedBlock;
  googleAds?: OrganicDashboardGoogleAdsPayload;
  sources?: {
    ga4: OrganicDashboardSourceStatus;
    gsc: OrganicDashboardSourceStatus;
    gscHistorical?: OrganicDashboardSourceStatus;
    semrush?: OrganicDashboardSourceStatus;
    googleAds?: OrganicDashboardSourceStatus;
  };
};

export type OrganicDashboardFetchParams = {
  siteUrl: string;
  ga4PropertyId: string;
  /** 10-digit Google Ads customer ID when set on the property. */
  googleAdsCustomerId?: string;
  semrushDatabase?: string;
  /** Semrush SEO project id (Site Audit / PT hub); used for dashboard link + server context. */
  semrushProjectId?: string;
  reportStructure: "compare" | "period_progress";
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
};

export function isOrganicSkippedBlock(
  block: unknown,
): block is OrganicDashboardSkippedBlock {
  return (
    !!block &&
    typeof block === "object" &&
    (block as OrganicDashboardSkippedBlock).skipped === true
  );
}
