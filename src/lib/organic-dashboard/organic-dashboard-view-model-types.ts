import type {
  OrganicGoogleAdsBudgetPacingDisplay,
  OrganicGoogleAdsChartPoint,
  OrganicGoogleAdsSummary,
  OrganicGoogleAdsTableRow,
} from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import type { OrganicPeriodProgressTables } from "@/lib/organic-dashboard/organic-dashboard-period-progress";

export type OrganicGa4TableRow = {
  label: string;
  current: string;
  previous: string;
  delta: OrganicGscMetricDelta;
};

export type OrganicGscQueryRow = {
  query: string;
  clicks: string;
  previousClicks: string;
  clicksDelta: OrganicGscMetricDelta;
  impressions: string;
  previousImpressions: string;
  impressionsDelta: OrganicGscMetricDelta;
  position: string;
};

export type OrganicChartPoint = {
  label: string;
  gaUsers?: number;
  gaSessions?: number;
  gscClicks?: number;
  gscImpressions?: number;
  gscAvgPosition?: number;
  semrushTraffic?: number;
  semrushKeywords?: number;
  semrushTrafficCost?: number;
};

export type OrganicGscMetricDelta = {
  deltaPercent: number | null;
  deltaPositive: boolean | null;
};

export type OrganicGscSummary = {
  clicks: string;
  impressions: string;
  ctr: string;
  avgPosition: string;
  compareClicks: string;
  compareImpressions: string;
  compareCtr: string;
  compareAvgPosition: string;
  clicksDelta: OrganicGscMetricDelta;
  impressionsDelta: OrganicGscMetricDelta;
  ctrDelta: OrganicGscMetricDelta;
  positionDelta: OrganicGscMetricDelta;
};

export type OrganicSemrushKeywordRow = {
  phrase: string;
  volume: string;
  traffic: string;
  position: string;
};

export type OrganicSemrushSummary = {
  keywords: string;
  traffic: string;
  trafficCost: string;
  brandedTraffic: string;
  nonBrandedTraffic: string;
  compareKeywords: string;
  compareTraffic: string;
  compareTrafficCost: string;
  compareBrandedTraffic: string;
  compareNonBrandedTraffic: string;
  keywordsDelta: OrganicGscMetricDelta;
  trafficDelta: OrganicGscMetricDelta;
  trafficCostDelta: OrganicGscMetricDelta;
  brandedDelta: OrganicGscMetricDelta;
  nonBrandedDelta: OrganicGscMetricDelta;
  hasBrandedMetrics: boolean;
};

export type OrganicDashboardPeriodLabels = {
  primary: string;
  compare: string;
};

export type OrganicDashboardViewModel = {
  ga4Table: OrganicGa4TableRow[];
  ga4MonthlyChart: OrganicChartPoint[];
  gscQueries: OrganicGscQueryRow[];
  gscTrendDaily: OrganicChartPoint[];
  gscTrendMonthly: OrganicChartPoint[];
  gscSummary: OrganicGscSummary | null;
  semrushSummary: OrganicSemrushSummary | null;
  semrushTrend: OrganicChartPoint[];
  semrushKeywords: OrganicSemrushKeywordRow[];
  semrushOverviewUrl: string;
  semrushDomain: string;
  semrushDatabase: string;
  semrushLoadError: string | null;
  periodLabels: OrganicDashboardPeriodLabels;
  reportStructure: "compare" | "period_progress";
  periodProgressTables: OrganicPeriodProgressTables | null;
  hasGa4: boolean;
  hasGsc: boolean;
  hasSemrush: boolean;
  googleAdsSummary: OrganicGoogleAdsSummary | null;
  googleAdsTable: OrganicGoogleAdsTableRow[];
  googleAdsDailyChart: OrganicGoogleAdsChartPoint[];
  googleAdsLoadError: string | null;
  googleAdsBudgetPacing: OrganicGoogleAdsBudgetPacingDisplay | null;
  hasGoogleAds: boolean;
};

export type OrganicDashboardViewModelOptions = {
  showCompare?: boolean;
  googleAdsCustomerIdForReporting?: string;
  periodTotalColumnLabel?: string;
  /** Accepted for call-site compatibility; the Semrush overview URL is derived from the bundle payload. */
  siteSemrushProjectDashboardUrl?: string;
};

