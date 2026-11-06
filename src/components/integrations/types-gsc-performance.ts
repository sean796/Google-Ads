// GSC Performance Report Types
export interface GSCPerformanceStats {
  currentPeriod: PeriodStats;
  comparisonPeriod: PeriodStats;
  comparisons: ComparisonMetrics;
  topKeywords: KeywordPerformance[];
}

export interface PeriodStats {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  pagesCount: number;
  searchTermsCount: number;
}

export interface ComparisonMetrics {
  clicksChange: number;
  clicksChangePercent: number;
  impressionsChange: number;
  impressionsChangePercent: number;
  ctrChange: number;
  ctrChangePercent: number;
  avgPositionChange: number;
  avgPositionChangePercent: number;
  pagesChange: number;
  pagesChangePercent: number;
  searchTermsChange: number;
  searchTermsChangePercent: number;
}

export interface KeywordPerformance {
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
  url?: string;
}

// GSC Page Performance Types
export interface GSCPageQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPagePerformanceResult {
  success: boolean;
  pageUrl: string;
  matchedUrl?: string | null;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  queries: GSCPageQuery[];
  topKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  } | null;
  totalQueries: number;
  property?: string;
  error?: string;
}
