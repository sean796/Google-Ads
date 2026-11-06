import type { GSCPerformanceStats, GMBReportData } from "@/components/integrations/types";
import type { GscCompareSignals } from "@/lib/gsc-reporting/gsc-reporting-compare-signals";

export type ReportType = 'standard' | 'progress';

/** Input shape compatible with ReportDiscoveryData - avoids circular import */
export interface GSCReportDiscoveryInput {
  site: { siteUrl: string };
  wordPressContext: {
    siteName: string;
    napInfo?: { name?: string; address?: string; phone?: string; email?: string };
    sampleTitles?: string[];
  };
  stats: GSCPerformanceStats;
  entityPagesData: {
    pages: Array<{
      url?: string;
      pagePath: string;
      impressions: number;
      position: number;
      isNew: boolean;
      impressionsChange: number;
      queries?: Array<{
        query: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>;
    }>;
  } | null;
  gmbData?: GMBReportData | null;
  historicalData?: {
    monthlyStats: Array<{ month: string; impressions: number; avgPosition: number }>;
  } | null;
}

export interface RawReportData {
  siteName: string;
  periodContext: string;
  currentPeriodLabel: string;
  comparisonPeriodLabel: string;
  growth: {
    impressions: number;
    clicks: number;
    pagesCount: number;
    searchTermsCount: number;
    avgPosition: number;
    comparisons: {
      impressionsChange: number;
      impressionsChangePercent: number;
      clicksChange: number;
      clicksChangePercent: number;
      pagesChange: number;
      searchTermsChange: number;
      avgPositionChange: number;
    };
  };
  keywords: Array<{
    query: string;
    currentImpressions: number;
    previousImpressions: number;
    currentClicks: number;
    previousClicks: number;
    currentRanking: number;
    previousRanking: number;
    impressionsChange: number;
    isNew: boolean;
    isLost: boolean;
  }>;
  entityPages: Array<{
    pagePath: string;
    url?: string;
    impressions: number;
    position: number;
    isNew: boolean;
    impressionsChange: number;
    queries?: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
  }>;
  gmb: {
    currentPeriod: { calls: number; directions: number; websiteClicks: number };
    comparisonPeriod: { calls: number; directions: number; websiteClicks: number };
  } | null;
  napInfo?: { name?: string; address?: string; phone?: string; email?: string };
  sampleTitles?: string[];
  monthlyStats?: Array<{ month: string; impressions: number; avgPosition: number }>;
  compareSignals?: GscCompareSignals | null;
}

/** Section definition: id, heading template (with {siteName}, {currentPeriodLabel}, {comparisonPeriodLabel}), purpose, table row cap if any */
export interface ReportSectionDef {
  id: string;
  heading: string;
  purpose: string;
  rowCap?: number;
  tableColumns?: string;
}

/** Report outline: standard GSC comparison report sections */
export const REPORT_OUTLINE: ReportSectionDef[] = [
  {
    id: "1",
    heading: "Search Performance - {currentPeriodLabel} vs {comparisonPeriodLabel}",
    purpose:
      "1 short overview paragraph covering Impression Growth, Traffic Surge, Index Expansion, and Keyword Discovery woven into the narrative. Use only RAW_DATA. No table. No bullet points. No numbered lists.",
  },
  {
    id: "2",
    heading: "Key Performance Insights for the Team",
    purpose:
      "1 short overview paragraph covering Visibility Scaling, Term Diversification, Local Footprint, Content Discovery, and Relevance Alignment woven into the narrative. AI derives from data. Absolutely NO table - do not create any table in this section. No bullet points. No numbered lists. No 'Strategic Focus' or 'Recommendation' tables.",
  },
  {
    id: "3",
    heading: "Service Area Pages (SAP) & Local SEO Performance",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then SAP table. CRITICAL: you MUST output ONE table row for EVERY single entity page in SCOPE_DATA.entityPages - if there are 20 pages you output 20 rows, if there are 10 you output 10. NEVER show fewer rows than exist in the data. Columns: Service Area Page | Position | Times Shown | Status. Status = NEW if isNew, else +N for impressionsChange. Sorted by Position ascending (best position first). Do NOT truncate, summarize, or limit the table in any way.",
    tableColumns: "Service Area Page | Position | Times Shown | Status",
  },
  {
    id: "4",
    heading: "Growth Metrics for {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then growth table. Exactly 4 rows. Columns: Metric | {currentPeriodLabel} | Growth vs {comparisonPeriodLabel}. Fixed rows: Times Shown in Google | Website Visitors from Search | Pages Ranking in Google | Search Terms Found For. Values from growth and comparisons.",
    rowCap: 4,
    tableColumns: "Metric | {currentPeriodLabel} | Growth vs {comparisonPeriodLabel}",
  },
  {
    id: "5",
    heading: "All Search Terms: {currentPeriodLabel} vs {comparisonPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) summarizing the full month-to-month comparison of ALL search terms (not just clicked or new ones). Then a table of the top 50 search terms by current impressions. Columns: Search Term | {comparisonPeriodLabel} Impressions | {currentPeriodLabel} Impressions | Change | {comparisonPeriodLabel} Position | {currentPeriodLabel} Position. Include terms that appeared in EITHER month. If a term had 0 impressions in a month it means it didn't appear that month. Sort by current impressions descending. Include all rows in SCOPE_DATA (already capped to 50).",
    rowCap: 50,
    tableColumns: "Search Term | {comparisonPeriodLabel} Imp. | {currentPeriodLabel} Imp. | Change | {comparisonPeriodLabel} Pos. | {currentPeriodLabel} Pos.",
  },
  {
    id: "9",
    heading: "Content Performance: Your Growing Digital Footprint",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then content table. Exactly 4 rows. Columns: Content Metric | {comparisonPeriodLabel} | {currentPeriodLabel} | Change. Fixed rows: Pages Appearing in Google (pagesCount) | Average Position (avgPosition) | Total Impressions (impressions) | Total Clicks (clicks). Use RAW_DATA growth object for {currentPeriodLabel} values and calculate {comparisonPeriodLabel} values by subtracting comparisons change from current values. Change column should show +N or -N with the numeric difference.",
    rowCap: 4,
    tableColumns: "Content Metric | {comparisonPeriodLabel} | {currentPeriodLabel} | Change",
  },
  {
    id: "10",
    heading: "Performance Summary Infographic",
    purpose:
      "Output a FULL PROMPT for creating the infographic. (1) Design spec: hex codes Background #02050A, Accent #84BD00, Text #fff; format Tall 9:16 mobile; theme Neon-Noir Tech; shapes only; NO faces; NO hashtags; NO Next Steps; Google/SEO icons. (2) ALL actual stats from RAW_DATA that must appear: impressions, clicks, growth % and change, pages count, keywords count, average position, top 2–3 SAP names and times shown. Self-contained so the section text can be used as the complete prompt for an infographic generator. No table.",
  },
  {
    id: "11",
    heading: "Frequently Asked Questions",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then Q&A table. Exactly 3 rows. Columns: Question | Answer. Generate 3 Q&As from growth and comparisons only.",
    rowCap: 3,
    tableColumns: "Question | Answer",
  },
];

/** Progress report outline: sections framed around "what we accomplished" over a timeframe */
export const PROGRESS_REPORT_OUTLINE: ReportSectionDef[] = [
  {
    id: "p1",
    heading: "Progress Overview: {currentPeriodLabel}",
    purpose:
      "1 short executive paragraph summarizing all accomplishments from the baseline period to now. Cover total impressions gained, pages indexed, new search terms discovered, and traffic growth. Frame as 'here is what we have achieved for your business'. Use only RAW_DATA. No table. No bullet points. No numbered lists.",
  },
  {
    id: "p2",
    heading: "Index Growth & Page Coverage - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then a table showing page indexing progress. Exactly 4 rows. Columns: Metric | Baseline ({comparisonPeriodLabel}) | Current ({currentPeriodLabel}) | Growth. Fixed rows: Pages Appearing in Google (pagesCount) | Search Terms Ranking For (searchTermsCount) | Average Position (avgPosition) | Total Impressions (impressions). Baseline values = current minus comparisons change. Growth = the change value with +/- prefix.",
    rowCap: 4,
    tableColumns: "Metric | Baseline ({comparisonPeriodLabel}) | Current ({currentPeriodLabel}) | Growth",
  },
  {
    id: "p3",
    heading: "Search Term Acquisition - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) about how many new search terms were discovered during the progress period. Mention total current terms count vs baseline. Then provide a summary of total new terms acquired (isNew count) and total search terms now ranking. No table in this section. No bullet points. No numbered lists.",
  },
  {
    id: "p4",
    heading: "Service Area Pages (SAP) Performance - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then SAP table. CRITICAL: output ONE table row for EVERY entity page in SCOPE_DATA.entityPages. Columns: Service Area Page | Position | Times Shown | Status. Status = NEW if isNew, else +N for impressionsChange. Sorted by Position ascending (best position first). Do NOT truncate.",
    tableColumns: "Service Area Page | Position | Times Shown | Status",
  },
  {
    id: "p5",
    heading: "Visibility & Traffic Growth - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then growth table. Exactly 4 rows. Columns: Metric | Baseline ({comparisonPeriodLabel}) | Current ({currentPeriodLabel}) | Growth. Fixed rows: Times Shown in Google (impressions) | Website Visitors from Search (clicks) | Pages Ranking in Google (pagesCount) | Search Terms Found For (searchTermsCount). Values from growth and comparisons. Baseline = current minus change.",
    rowCap: 4,
    tableColumns: "Metric | Baseline ({comparisonPeriodLabel}) | Current ({currentPeriodLabel}) | Growth",
  },
  {
    id: "p6",
    heading: "Service Area Pages & Their Search Terms - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then a table showing every service area page and the search terms it ranks for. Columns: Service Area Page URL | Search Term | Times Shown | Clicks | Position. Include ALL rows from SCOPE_DATA.entityPages and their queries - do not truncate. Output one or more rows per page depending on how many queries it has. Sorted by page Position (best first), and within each page, by impressions descending.",
    tableColumns: "Service Area Page URL | Search Term | Times Shown | Clicks | Position",
  },
  {
    id: "p8",
    heading: "Local Market Expansion - {currentPeriodLabel}",
    purpose:
      "1 short overview paragraph (no bullet points, no numbered lists) then local terms table. Include ALL rows from SCOPE_DATA - do not truncate. Columns: Local Search Term | Position | Times Shown | Status. Status = NEW if isNew, else +N for impressionsChange. Sorted by Position ascending. Keywords with local intent (e.g. 'near me' or location names).",
    rowCap: 15,
    tableColumns: "Local Search Term | Position | Times Shown | Status",
  },
  {
    id: "p9",
    heading: "Monthly Trend Summary - {currentPeriodLabel}",
    purpose:
      "1 short narrative paragraph (no bullet points, no numbered lists) then a month-by-month table if SCOPE_DATA.monthlyStats is available. Columns: Month | Impressions | Avg Position. Show the trajectory of growth over time. If monthlyStats is empty or unavailable, write a paragraph summarizing the overall growth using RAW_DATA growth metrics instead. No bullet points.",
    tableColumns: "Month | Impressions | Avg Position",
  },
  {
    id: "p10",
    heading: "Performance Summary Infographic",
    purpose:
      "Output a FULL PROMPT for creating a progress infographic. (1) Design spec: hex codes Background #02050A, Accent #84BD00, Text #fff; format Tall 9:16 mobile; theme Neon-Noir Tech; shapes only; NO faces; NO hashtags; NO Next Steps; Google/SEO icons. (2) Title: 'Progress Report: {currentPeriodLabel}'. (3) ALL actual stats from RAW_DATA: impressions, clicks, growth % and change, pages count, keywords count, average position, top 2-3 SAP names and times shown, new terms count. Self-contained so the section text can be used as the complete prompt for an infographic generator. No table.",
  },
];
