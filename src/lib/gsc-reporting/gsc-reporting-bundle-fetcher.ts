/**
 * Fetch GSC reporting seed data from backend and return raw CSV text (no KB enrichment).
 * Uses POST /api/gsc/fetch-reporting-bundle: queries, page performance, sitemap list, indexed URL list.
 */
import type { GscCompareRanges } from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import {
  deriveGscCompareSignals,
  gscCompareSignalsFileContent,
  GSC_COMPARE_SIGNALS_FILENAME,
  type GscCompareKind,
} from "@/lib/gsc-reporting/gsc-reporting-compare-signals";
import {
  deriveQuerySpotlights,
  GSC_QUERY_SPOTLIGHT_FILENAME,
  querySpotlightNarrativeFileContent,
} from "@/lib/gsc-reporting/gsc-query-spotlight";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import {
  gscPagesPeriodCsv,
  gscQueriesPeriodCsv,
  gscSiteTotalsByMonthCsv,
  GSC_PAGES_PERIOD_FILENAME,
  GSC_QUERIES_PERIOD_FILENAME,
  GSC_SITE_TOTALS_BY_MONTH_FILENAME,
  parseMonthlyTotalsFromApi,
  type GscReportStructure,
} from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
import {
  gscCompactPeriodLabelFromIsoRange,
  gscIndexedUrlsCsvFromPages,
  gscPagesMomComparisonCsv,
  gscQueriesMomComparisonCsv,
  gscSiteTotalsMomComparisonCsv,
  gscSitemapsToCsv,
  type GscPagePerfRow,
  type GscQueryPerfRow,
  type GscSiteTotalsPreviousMonth,
  type GscSitemapApiRow,
} from "@/lib/gsc-reporting/gsc-reporting-csv-serializers";
import {
  getApiBase,
  pushGaOrganicFilesOntoBundle,
} from "@/lib/gsc-reporting/gsc-reporting-ga-bundle";

export type GscReportingFetchResult = {
  files: { name: string; content: string }[];
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
  /** Legacy: only when fetch was single-period (no longer used from Reporting). */
  siteTotalsPreviousMonth: GscSiteTotalsPreviousMonth | null;
};

function errorMessageFromApiPayload(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    if (typeof row.error === "string" && row.error.trim()) {
      return row.error.trim();
    }
    if (typeof row.message === "string" && row.message.trim()) {
      return row.message.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return `HTTP ${status}`;
}

export type GscReportingFetchOptions = {
  compareKind?: GscCompareKind;
  compareLabel?: string;
  ga4PropertyId?: string;
  reportStructure?: GscReportStructure;
};

export async function fetchGscQueriesRawForReporting(
  siteUrl: string,
  ranges: GscCompareRanges,
  options?: GscReportingFetchOptions,
): Promise<GscReportingFetchResult> {
  const API_BASE = getApiBase();

  const startDateStr = ranges.primary.startDate.trim();
  const endDateStr = ranges.primary.endDate.trim();
  const compareStartDateStr = ranges.compare.startDate.trim();
  const compareEndDateStr = ranges.compare.endDate.trim();
  const reportStructure = options?.reportStructure ?? "compare";
  const periodProgress = reportStructure === "period_progress";

  const requestBody: Record<string, string> = {
    siteUrl,
    startDate: startDateStr,
    endDate: endDateStr,
  };
  if (periodProgress) {
    requestBody.reportStructure = "period_progress";
  } else {
    requestBody.compareStartDate = compareStartDateStr;
    requestBody.compareEndDate = compareEndDateStr;
  }

  const response = await fetch(`${API_BASE}/api/gsc/fetch-reporting-bundle`, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as {
    success?: boolean;
    error?: string;
    queries?: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
      date?: string;
    }>;
    pages?: GscPagePerfRow[];
    pagesError?: string;
    compareQueries?: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
      date?: string;
    }>;
    comparePages?: GscPagePerfRow[];
    comparePagesError?: string;
    siteTotalsPreviousMonth?: GscSiteTotalsPreviousMonth | null;
    aggregatePrimary?: GscSiteTotalsPreviousMonth | null;
    aggregateCompare?: GscSiteTotalsPreviousMonth | null;
    monthlyTotals?: unknown;
    sitemaps?: GscSitemapApiRow[];
    sitemapsError?: string;
  };

  if (!response.ok || !data.success) {
    throw new Error(errorMessageFromApiPayload(data, response.status));
  }

  const queries = data.queries ?? [];
  const pages = data.pages ?? [];
  const compareQueries = data.compareQueries ?? [];
  const comparePages = data.comparePages ?? [];

  const hasAnyData =
    queries.length > 0 ||
    pages.length > 0 ||
    compareQueries.length > 0 ||
    comparePages.length > 0;
  if (!hasAnyData) {
    throw new Error(
      periodProgress
        ? "No GSC queries or page rows returned for this period."
        : "No GSC queries or page rows returned for either period in this comparison.",
    );
  }

  if (periodProgress) {
    const monthlyTotals = parseMonthlyTotalsFromApi(data.monthlyTotals);
    if (monthlyTotals.length === 0) {
      throw new Error("Monthly Search Console totals missing for period progress reporting.");
    }
    const periodLabel = gscCompactPeriodLabelFromIsoRange(startDateStr, endDateStr);
    const toQueryPerf = (rows: typeof queries): GscQueryPerfRow[] =>
      rows.map((r) => ({
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));
    const files: { name: string; content: string }[] = [
      {
        name: GSC_SITE_TOTALS_BY_MONTH_FILENAME,
        content: gscSiteTotalsByMonthCsv(monthlyTotals),
      },
      {
        name: GSC_QUERIES_PERIOD_FILENAME,
        content: gscQueriesPeriodCsv(toQueryPerf(queries), periodLabel),
      },
      {
        name: GSC_PAGES_PERIOD_FILENAME,
        content: gscPagesPeriodCsv(pages, periodLabel),
      },
    ];
    if (pages.length) {
      files.push({
        name: "Indexed-pages-urls-current.csv",
        content: gscIndexedUrlsCsvFromPages(pages, startDateStr, endDateStr),
      });
    } else {
      const err = data.pagesError?.trim() || "No page rows returned.";
      files.push({
        name: "Indexed-pages-urls-current.csv",
        content: `# ${err}\n# URL\n`,
      });
    }
    const sm = data.sitemaps;
    if (Array.isArray(sm) && sm.length > 0) {
      files.push({ name: "GSC-sitemaps.csv", content: gscSitemapsToCsv(sm) });
    } else {
      const err = data.sitemapsError?.trim() || "No sitemap entries returned.";
      files.push({
        name: "GSC-sitemaps.csv",
        content: `# Sitemap list could not be loaded or is empty.\n# ${err.replace(/\n/g, "\n# ")}\n`,
      });
    }
    await pushGaOrganicFilesOntoBundle(files, options?.ga4PropertyId, {
      periodProgress: true,
      startDateStr,
      endDateStr,
      compareStartDateStr,
      compareEndDateStr,
      ranges,
    });
    return {
      files,
      startDate: startDateStr,
      endDate: endDateStr,
      compareStartDate: compareStartDateStr,
      compareEndDate: compareEndDateStr,
      siteTotalsPreviousMonth: data.siteTotalsPreviousMonth ?? null,
    };
  }

  const files: { name: string; content: string }[] = [];

  const toQueryPerf = (rows: typeof queries): GscQueryPerfRow[] =>
    rows.map((r) => ({
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

  if (queries.length || compareQueries.length) {
    files.push({
      name: "Queries-MoM.csv",
      content: gscQueriesMomComparisonCsv(
        toQueryPerf(queries),
        toQueryPerf(compareQueries),
        { start: startDateStr, end: endDateStr },
        { start: compareStartDateStr, end: compareEndDateStr },
      ),
    });
  } else {
    files.push({
      name: "Queries-MoM.csv",
      content: `# No query rows in either period (period A ${startDateStr} → ${endDateStr}, period B ${compareStartDateStr} → ${compareEndDateStr}).\n`,
    });
  }

  if (pages.length || comparePages.length) {
    files.push({
      name: "Pages-MoM.csv",
      content: gscPagesMomComparisonCsv(pages, comparePages, { start: startDateStr, end: endDateStr }, {
        start: compareStartDateStr,
        end: compareEndDateStr,
      }),
    });
  } else {
    const err = data.pagesError?.trim() || data.comparePagesError?.trim() || "No page rows returned.";
    files.push({
      name: "Pages-MoM.csv",
      content: `# No page rows in either period.\n# ${String(err).replace(/\n/g, "\n# ")}\n`,
    });
  }

  if (pages.length) {
    files.push({
      name: "Indexed-pages-urls-current.csv",
      content: gscIndexedUrlsCsvFromPages(pages, startDateStr, endDateStr),
    });
  } else {
    const err = data.pagesError?.trim() || "No page rows returned.";
    files.push({
      name: "Indexed-pages-urls-current.csv",
      content: `# ${err}\n# URL\n`,
    });
  }

  if (comparePages.length) {
    files.push({
      name: "Indexed-pages-urls-period-b.csv",
      content: gscIndexedUrlsCsvFromPages(comparePages, compareStartDateStr, compareEndDateStr),
    });
  } else {
    const err = data.comparePagesError?.trim() || "No page rows returned.";
    files.push({
      name: "Indexed-pages-urls-period-b.csv",
      content: `# ${err}\n# URL\n`,
    });
  }

  const aggP = data.aggregatePrimary ?? null;
  const aggC = data.aggregateCompare ?? null;
  files.push({
    name: "Site-totals-MoM.csv",
    content: gscSiteTotalsMomComparisonCsv(aggP, aggC, queries.length, compareQueries.length),
  });

  const compareKind = options?.compareKind ?? "mom";
  const compareLabel =
    options?.compareLabel ??
    `${gscCompactPeriodLabelFromIsoRange(startDateStr, endDateStr)} vs ${gscCompactPeriodLabelFromIsoRange(compareStartDateStr, compareEndDateStr)}`;
  const compareSignals = deriveGscCompareSignals({
    compareKind,
    compareLabel,
    aggregatePrimary: aggP,
    aggregateCompare: aggC,
    queryCountPrimary: queries.length,
    queryCountCompare: compareQueries.length,
    primaryQueries: toQueryPerf(queries),
    compareQueries: toQueryPerf(compareQueries),
  });
  if (compareSignals) {
    files.push({
      name: GSC_COMPARE_SIGNALS_FILENAME,
      content: gscCompareSignalsFileContent(compareSignals),
    });
  }

  const primaryQ = toQueryPerf(queries);
  const compareQ = toQueryPerf(compareQueries);
  const spotlights = deriveQuerySpotlights(primaryQ, compareQ);
  files.push({
    name: GSC_QUERY_SPOTLIGHT_FILENAME,
    content: querySpotlightNarrativeFileContent(spotlights),
  });

  const sm = data.sitemaps;
  if (Array.isArray(sm) && sm.length > 0) {
    files.push({ name: "GSC-sitemaps.csv", content: gscSitemapsToCsv(sm) });
  } else {
    const err = data.sitemapsError?.trim() || "No sitemap entries returned.";
    files.push({
      name: "GSC-sitemaps.csv",
      content: `# Sitemap list could not be loaded or is empty.\n# ${err.replace(/\n/g, "\n# ")}\n`,
    });
  }

  await pushGaOrganicFilesOntoBundle(files, options?.ga4PropertyId, {
    periodProgress: false,
    startDateStr,
    endDateStr,
    compareStartDateStr,
    compareEndDateStr,
    ranges,
  });

  return {
    files,
    startDate: startDateStr,
    endDate: endDateStr,
    compareStartDate: compareStartDateStr,
    compareEndDate: compareEndDateStr,
    siteTotalsPreviousMonth: data.siteTotalsPreviousMonth ?? null,
  };
}
