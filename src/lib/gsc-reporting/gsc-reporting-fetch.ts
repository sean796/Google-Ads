/**
 * Fetch GSC reporting seed data from backend and return raw CSV text (no KB enrichment).
 * Uses POST /api/gsc/fetch-reporting-bundle: queries, page performance, sitemap list, indexed URL list.
 */
import {
  pickGa4OrganicAcquisition,
  type GA4OrganicAcquisitionPeriod,
  type GA4OrganicTrafficAcquisitionMonthlyBlock,
  type GA4ReportData,
} from "@/components/integrations/types";
import {
  GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME,
  gaOrganicTrafficAcquisitionByMonthCsv,
  parseGaOrganicTrafficAcquisitionByMonthCsv,
} from "@/lib/gsc-reporting/gsc-reporting-ga-acquisition-monthly";
import { parseGaOrganicTrafficAcquisitionMomCsv } from "@/lib/gsc-reporting/gsc-reporting-ga-organic-table";
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
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import {
  csvDashNumberCell,
  csvNumberCell,
  formatCanadianNumber,
} from "@/lib/gsc-reporting/gsc-number-format";
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
export type { GscReportStructure } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
/** Site-wide Search Analytics aggregate for one date range (no dimensions). */
export type GscSiteTotalsPreviousMonth = {
  label: string;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscReportingFetchResult = {
  files: { name: string; content: string }[];
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
  /** Legacy: only when fetch was single-period (no longer used from Reporting). */
  siteTotalsPreviousMonth: GscSiteTotalsPreviousMonth | null;
};

export type GscPagePerfRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date?: string;
};

/** Sitemap resource from webmasters v3 sitemaps.list (partial). */
export type GscSitemapApiRow = {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  type?: string;
  errors?: number;
  warnings?: number;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
};

function getApiBase(): string {
  return BACKEND_API_BASE;
}

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

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCtr(ctr: number): string {
  const c = ctr <= 1 ? ctr * 100 : ctr;
  return `${formatCanadianNumber(c)}%`;
}

function formatPosition(position: number): string {
  return formatCanadianNumber(position);
}

/** True when start/end are the first and last day of the same UTC calendar month. */
export function gscIsFullCalendarMonthRange(startIso: string, endIso: string): boolean {
  const a = startIso.trim();
  const b = endIso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  const s = new Date(`${a}T12:00:00.000Z`);
  const e = new Date(`${b}T12:00:00.000Z`);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return false;
  const sy = s.getUTCFullYear();
  const sm = s.getUTCMonth();
  const sd = s.getUTCDate();
  const ey = e.getUTCFullYear();
  const em = e.getUTCMonth();
  const ed = e.getUTCDate();
  const lastDayOfMonth = new Date(Date.UTC(ey, em + 1, 0)).getUTCDate();
  return sy === ey && sm === em && sd === 1 && ed === lastDayOfMonth;
}

/**
 * Compact label for a YYYY-MM-DD range: full calendar month → "Mar 2026", else "start–end" ISO.
 * Used in MoM CSV headers so columns reflect actual fetch ranges.
 */
export function gscCompactPeriodLabelFromIsoRange(startIso: string, endIso: string): string {
  const a = startIso.trim();
  const b = endIso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return `${a}–${b}`;
  }
  const s = new Date(`${a}T12:00:00.000Z`);
  const e = new Date(`${b}T12:00:00.000Z`);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) {
    return `${a}–${b}`;
  }
  if (gscIsFullCalendarMonthRange(a, b)) {
    return s.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return `${a}–${b}`;
}

function momQueriesPagesCsvHeaderRow(
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
  firstCol: "Query" | "Page",
): string {
  const la = gscCompactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const lb = gscCompactPeriodLabelFromIsoRange(compareRange.start, compareRange.end);
  // Per metric: First (current) | Last (prior) | Change - same order the report must mirror.
  return [
    firstCol,
    `Clicks (${la})`,
    `Clicks (${lb})`,
    "Clicks Δ%",
    `Impressions (${la})`,
    `Impressions (${lb})`,
    "Impr Δ%",
    `CTR (${la})`,
    `CTR (${lb})`,
    "CTR Δ%",
    `Position (${la})`,
    `Position (${lb})`,
    "Pos Δ%",
  ].join(",");
}

/** Build a Queries.csv-style export from API rows (no Date column - period is the fetch range). */
export function gscQueriesToCsv(
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    date?: string;
  }>,
): string {
  const header = "Query,Clicks,Impressions,CTR,Position";
  const rows = queries.map((q) => {
    return [
      escapeCsvCell(q.query),
      csvNumberCell(q.clicks),
      csvNumberCell(q.impressions),
      formatCtr(q.ctr),
      formatPosition(q.position as number),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export type GscQueryPerfRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * SEO-style query report: one row per query with period A vs period B metrics and % change (same formula as site totals MoM).
 */
export function gscQueriesMomComparisonCsv(
  primary: GscQueryPerfRow[],
  compare: GscQueryPerfRow[],
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const byQuery = new Map<string, { p?: GscQueryPerfRow; c?: GscQueryPerfRow }>();
  for (const r of primary) {
    const k = r.query.trim();
    if (!k) continue;
    byQuery.set(k, { ...(byQuery.get(k) ?? {}), p: r });
  }
  for (const r of compare) {
    const k = r.query.trim();
    if (!k) continue;
    byQuery.set(k, { ...(byQuery.get(k) ?? {}), c: r });
  }
  const keys = [...byQuery.keys()].sort((a, b) => {
    const ia = byQuery.get(a)?.p?.impressions ?? byQuery.get(a)?.c?.impressions ?? 0;
    const ib = byQuery.get(b)?.p?.impressions ?? byQuery.get(b)?.c?.impressions ?? 0;
    if (ib !== ia) return ib - ia;
    return a.localeCompare(b);
  });

  const lines: string[] = [
    "# Queries: MoM (one row per query; Search Analytics totals per period). Period names in column headers match the fetch ranges.",
    "#",
    momQueriesPagesCsvHeaderRow(primaryRange, compareRange, "Query"),
  ];

  const pct = (a: number | undefined, b: number | undefined): string => {
    if (a === undefined || b === undefined) return " - ";
    return gscSiteTotalsPctChangeVsPrior(a, b);
  };

  for (const k of keys) {
    const { p, c } = byQuery.get(k)!;
    lines.push(
      [
        escapeCsvCell(k),
        csvDashNumberCell(p?.clicks),
        csvDashNumberCell(c?.clicks),
        pct(p?.clicks, c?.clicks),
        csvDashNumberCell(p?.impressions),
        csvDashNumberCell(c?.impressions),
        pct(p?.impressions, c?.impressions),
        p ? formatCtr(p.ctr) : " - ",
        c ? formatCtr(c.ctr) : " - ",
        pct(p?.ctr, c?.ctr),
        p ? formatPosition(p.position) : " - ",
        c ? formatPosition(c.position) : " - ",
        pct(p?.position, c?.position),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/** Page-level Search Analytics (dimension: page). */
export function gscPagesToCsv(pages: GscPagePerfRow[]): string {
  const header = "Page,Clicks,Impressions,CTR,Position";
  const rows = pages.map((p) => {
    return [
      escapeCsvCell(p.page),
      csvNumberCell(p.clicks),
      csvNumberCell(p.impressions),
      formatCtr(p.ctr),
      formatPosition(p.position as number),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

/**
 * SEO-style page report: one row per URL with period A vs period B metrics and % change.
 */
export function gscPagesMomComparisonCsv(
  primary: GscPagePerfRow[],
  compare: GscPagePerfRow[],
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const byPage = new Map<string, { p?: GscPagePerfRow; c?: GscPagePerfRow }>();
  for (const r of primary) {
    const k = r.page.trim();
    if (!k) continue;
    byPage.set(k, { ...(byPage.get(k) ?? {}), p: r });
  }
  for (const r of compare) {
    const k = r.page.trim();
    if (!k) continue;
    byPage.set(k, { ...(byPage.get(k) ?? {}), c: r });
  }
  const keys = [...byPage.keys()].sort((a, b) => {
    const ia = byPage.get(a)?.p?.impressions ?? byPage.get(a)?.c?.impressions ?? 0;
    const ib = byPage.get(b)?.p?.impressions ?? byPage.get(b)?.c?.impressions ?? 0;
    if (ib !== ia) return ib - ia;
    return a.localeCompare(b);
  });

  const lines: string[] = [
    "# Pages: MoM (one row per URL; Search Analytics totals per period). Period names in column headers match the fetch ranges.",
    "#",
    momQueriesPagesCsvHeaderRow(primaryRange, compareRange, "Page"),
  ];

  const pct = (a: number | undefined, b: number | undefined): string => {
    if (a === undefined || b === undefined) return " - ";
    return gscSiteTotalsPctChangeVsPrior(a, b);
  };

  for (const k of keys) {
    const { p, c } = byPage.get(k)!;
    lines.push(
      [
        escapeCsvCell(k),
        csvDashNumberCell(p?.clicks),
        csvDashNumberCell(c?.clicks),
        pct(p?.clicks, c?.clicks),
        csvDashNumberCell(p?.impressions),
        csvDashNumberCell(c?.impressions),
        pct(p?.impressions, c?.impressions),
        p ? formatCtr(p.ctr) : " - ",
        c ? formatCtr(c.ctr) : " - ",
        pct(p?.ctr, c?.ctr),
        p ? formatPosition(p.position) : " - ",
        c ? formatPosition(c.position) : " - ",
        pct(p?.position, c?.position),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/** One-row scorecard CSV for previous calendar month (matches GSC Performance monthly totals). */
export function gscSiteTotalsPreviousMonthToCsv(t: GscSiteTotalsPreviousMonth): string {
  const lines = [
    "# Site-wide Search performance (all queries and pages aggregated)",
    `# Previous calendar month: ${t.label}`,
    `# Range: ${t.startDate} → ${t.endDate}. In GSC: Performance → set date to this range → Monthly.`,
    "#",
    "Metric,Value",
    `Total clicks,${csvNumberCell(t.clicks)}`,
    `Total impressions,${csvNumberCell(t.impressions)}`,
    `Average CTR,${formatCtr(t.ctr)}`,
    `Average position,${formatPosition(t.position)}`,
  ];
  return lines.join("\n");
}

/** Site-wide aggregate for one reporting period (same shape as {@link GscSiteTotalsPreviousMonth}). */
export function gscSitePeriodTotalsToCsv(t: GscSiteTotalsPreviousMonth, periodTitle: string): string {
  const lines = [
    "# Site-wide Search performance (all queries and pages aggregated)",
    `# ${periodTitle}: ${t.label}`,
    `# Range: ${t.startDate} → ${t.endDate}. In GSC: Performance → set date to this range → Monthly.`,
    "#",
    "Metric,Value",
    `Total clicks,${csvNumberCell(t.clicks)}`,
    `Total impressions,${csvNumberCell(t.impressions)}`,
    `Average CTR,${formatCtr(t.ctr)}`,
    `Average position,${formatPosition(t.position)}`,
  ];
  return lines.join("\n");
}

/** Percent change vs prior period: `((current − prior) / prior) × 100`, or em dash when invalid. */
export function gscSiteTotalsPctChangeVsPrior(primary: number, compare: number): string {
  if (compare === 0) return " - ";
  const v = ((primary - compare) / compare) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/**
 * Single scorecard CSV: period A vs period B site-wide aggregates with % change per metric.
 * Value columns use the same formatting as single-period exports; % uses raw API numbers.
 */
export function gscSiteTotalsMomComparisonCsv(
  aggregatePrimary: GscSiteTotalsPreviousMonth | null,
  aggregateCompare: GscSiteTotalsPreviousMonth | null,
  queryCountPrimary: number,
  queryCountCompare: number,
): string {
  const colA =
    aggregatePrimary != null
      ? gscCompactPeriodLabelFromIsoRange(aggregatePrimary.startDate, aggregatePrimary.endDate)
      : "Period A";
  const colB =
    aggregateCompare != null
      ? gscCompactPeriodLabelFromIsoRange(aggregateCompare.startDate, aggregateCompare.endDate)
      : "Period B";
  const lines: string[] = [
    "# Site-wide Search performance (MoM). Value columns use the same period labels as the header row; in GSC use Monthly and match dates.",
    "#",
    `Metric,${escapeCsvCell(colA)},${escapeCsvCell(colB)},% change vs prior`,
  ];

  const dash = (n: number | null | undefined): string => csvDashNumberCell(n);
  const pctCell = (p: number | null | undefined, c: number | null | undefined): string => {
    if (p === null || p === undefined || c === null || c === undefined) return " - ";
    return gscSiteTotalsPctChangeVsPrior(p, c);
  };

  const p = aggregatePrimary;
  const c = aggregateCompare;

  lines.push(
    `Total clicks,${dash(p?.clicks)},${dash(c?.clicks)},${pctCell(p?.clicks, c?.clicks)}`,
  );
  lines.push(
    `Total impressions,${dash(p?.impressions)},${dash(c?.impressions)},${pctCell(p?.impressions, c?.impressions)}`,
  );
  lines.push(
    `Search queries,${csvNumberCell(queryCountPrimary)},${csvNumberCell(queryCountCompare)},${gscSiteTotalsPctChangeVsPrior(queryCountPrimary, queryCountCompare)}`,
  );
  lines.push(
    `Average CTR,${p ? formatCtr(p.ctr) : " - "},${c ? formatCtr(c.ctr) : " - "},${pctCell(p?.ctr, c?.ctr)}`,
  );
  lines.push(
    `Average position,${p ? formatPosition(p.position) : " - "},${c ? formatPosition(c.position) : " - "},${pctCell(
      p?.position,
      c?.position,
    )}`,
  );

  return lines.join("\n");
}

/** HTTP(S) page URLs from an Indexed-pages CSV (comment lines skipped). */
export function gscIndexedPageUrlsFromCsv(content: string): string[] {
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
      urls.push(trimmed);
    }
  }
  return urls;
}

/** Unique URLs that had Search traffic in the range (page dimension). Same semantics as POST /api/gsc/url-inventory. */
export function gscIndexedUrlsCsvFromPages(
  pages: GscPagePerfRow[],
  startDate: string,
  endDate: string,
): string {
  const lines: string[] = [
    `# Indexed pages proxy (${startDate} → ${endDate})`,
    "# Each URL had at least one impression in Google Search in this date range (Search Analytics API, page dimension).",
    "# The Indexing → Indexed pages report in the GSC UI is not available via API; this list is the standard bulk substitute.",
    "#",
    "URL",
  ];
  const uniq = [...new Set(pages.map((p) => p.page.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const u of uniq) lines.push(escapeCsvCell(u));
  return lines.join("\n");
}

export function gscSitemapsToCsv(sitemaps: GscSitemapApiRow[]): string {
  const header =
    "Path,LastSubmitted,LastDownloaded,Errors,Warnings,IsPending,IsSitemapsIndex,Type,SubmittedWeb,IndexedWeb";
  const rows = sitemaps.map((s) => {
    const contents = Array.isArray(s.contents) ? s.contents : [];
    const web = contents.find((c) => c?.type === "web") ?? contents[0];
    const submitted = web?.submitted != null ? String(web.submitted) : "";
    const indexed = web?.indexed != null ? String(web.indexed) : "";
    return [
      escapeCsvCell(String(s.path ?? "")),
      escapeCsvCell(String(s.lastSubmitted ?? "")),
      escapeCsvCell(String(s.lastDownloaded ?? "")),
      String(s.errors ?? ""),
      String(s.warnings ?? ""),
      String(Boolean(s.isPending)),
      String(Boolean(s.isSitemapsIndex)),
      escapeCsvCell(String(s.type ?? "")),
      escapeCsvCell(submitted),
      escapeCsvCell(indexed),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export const GA_ORGANIC_TRAFFIC_ACQUISITION_MOM_FILENAME =
  "GA-Organic-Search-Traffic-Acquisition-MoM.csv";

export { GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME };

export function bundleHasGaOrganicReportingFilename(files: { name: string }[]): boolean {
  return files.some((f) => isGaTrafficReportingFile(f.name));
}

function gaOrganicReportingFileLooksLikeFetchError(content: string): boolean {
  return /^#\s*GA4 data could not be loaded/i.test(content.trim());
}

/** True when GA CSV has parseable organic traffic metrics (not an error stub). */
export function isValidGaOrganicReportingFileContent(name: string, content: string): boolean {
  const n = name.trim();
  const c = content.trim();
  if (!c || gaOrganicReportingFileLooksLikeFetchError(c)) return false;
  if (n === GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME) {
    const { months, totals } = parseGaOrganicTrafficAcquisitionByMonthCsv(c);
    return months.length > 0 && totals != null && totals.sessions > 0;
  }
  if (n === GA_ORGANIC_TRAFFIC_ACQUISITION_MOM_FILENAME) {
    return parseGaOrganicTrafficAcquisitionMomCsv(c).length > 0;
  }
  return false;
}

export function bundleHasValidGaOrganicTrafficData(files: { name: string; content: string }[]): boolean {
  return files.some((f) => isValidGaOrganicReportingFileContent(f.name, f.content));
}

/** @deprecated Use bundleHasValidGaOrganicTrafficData for gating; this alias kept for imports. */
export function seedHasGaTrafficAcquisitionFile(files: { name: string; content: string }[]): boolean {
  return bundleHasValidGaOrganicTrafficData(files);
}

export function isGaTrafficReportingFile(filename: string): boolean {
  const n = filename.trim();
  return (
    n === GA_ORGANIC_TRAFFIC_ACQUISITION_MOM_FILENAME ||
    n === GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME
  );
}

export function removeGaOrganicReportingFiles(files: { name: string; content: string }[]): void {
  for (let i = files.length - 1; i >= 0; i--) {
    if (isGaTrafficReportingFile(files[i]!.name)) {
      files.splice(i, 1);
    }
  }
}

export async function appendGaOrganicReportingFileToBundle(
  files: { name: string; content: string }[],
  args: {
    ga4PropertyId: string;
    periodProgress: boolean;
    primary: { startDate: string; endDate: string };
    compare: { startDate: string; endDate: string };
    compareRanges: GscCompareRanges;
  },
): Promise<void> {
  const propertyId = args.ga4PropertyId.trim();
  if (!propertyId) {
    throw new Error(
      "GA4 Property ID is required for SEO reporting. GA4 is website traffic; Search Console is keywords and visibility.",
    );
  }
  const file = args.periodProgress
    ? await fetchGaOrganicTrafficAcquisitionByMonthFile(args.primary, args.compare, propertyId)
    : await fetchGaOrganicTrafficAcquisitionMomFile(args.compareRanges, propertyId);
  files.push(file);
}

export async function ensureGaOrganicTrafficInReportingBundle(
  files: { name: string; content: string }[],
  args: {
    ga4PropertyId: string;
    periodProgress: boolean;
    primary: { startDate: string; endDate: string };
    compare: { startDate: string; endDate: string };
    compareRanges: GscCompareRanges;
  },
): Promise<void> {
  const propertyId = args.ga4PropertyId.trim();
  if (!propertyId) {
    throw new Error(
      "GA4 Property ID is required for SEO reporting. Set it on this site in Integrations. GA4 is website traffic; Search Console is keywords and visibility.",
    );
  }
  if (!bundleHasValidGaOrganicTrafficData(files)) {
    removeGaOrganicReportingFiles(files);
    await appendGaOrganicReportingFileToBundle(files, {
      ga4PropertyId: propertyId,
      periodProgress: args.periodProgress,
      primary: args.primary,
      compare: args.compare,
      compareRanges: args.compareRanges,
    });
  }
  if (!bundleHasValidGaOrganicTrafficData(files)) {
    throw new Error(
      "GA4 organic traffic data is missing or invalid for this report. Confirm the Property ID and Google Analytics access for this client.",
    );
  }
}

async function pushGaOrganicFilesOntoBundle(
  files: { name: string; content: string }[],
  ga4PropertyId: string | undefined,
  options: {
    periodProgress: boolean;
    startDateStr: string;
    endDateStr: string;
    compareStartDateStr: string;
    compareEndDateStr: string;
    ranges: GscCompareRanges;
  },
): Promise<void> {
  const id = ga4PropertyId?.trim();
  if (!id) {
    throw new Error(
      "GA4 Property ID is required for SEO reporting. GA4 is website traffic; Search Console is keywords and visibility.",
    );
  }
  await appendGaOrganicReportingFileToBundle(files, {
    ga4PropertyId: id,
    periodProgress: options.periodProgress,
    primary: { startDate: options.startDateStr, endDate: options.endDateStr },
    compare: { startDate: options.compareStartDateStr, endDate: options.compareEndDateStr },
    compareRanges: options.ranges,
  });
}

function gaMomPctCell(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return " - ";
  if (previous === 0) {
    return current > 0 ? "+100%" : "0%";
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function gaCountCell(n: number): string {
  if (!Number.isFinite(n)) return " - ";
  return formatCanadianNumber(n);
}

function gaEngagementRateCell(rate: number): string {
  if (!Number.isFinite(rate)) return " - ";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(2)}%`;
}

function gaDurationCell(sec: number): string {
  if (!Number.isFinite(sec)) return " - ";
  return `${Math.round(sec)}s`;
}

function gaDecimalCell(n: number): string {
  if (!Number.isFinite(n)) return " - ";
  return formatCanadianNumber(n);
}

function gaMomMetricRow(
  label: string,
  currentDisplay: string,
  previousDisplay: string,
  currentNum: number,
  previousNum: number,
): string {
  return [
    escapeCsvCell(label),
    escapeCsvCell(currentDisplay),
    escapeCsvCell(previousDisplay),
    escapeCsvCell(gaMomPctCell(currentNum, previousNum)),
  ].join(",");
}

export function gaOrganicSessionsFromTraffic(payload: {
  channels?: Array<{
    channel: string;
    sessionsCurrent: number;
    sessionsPrevious: number;
    change: number;
    changePercent: number | null;
  }>;
}): { sessionsCurrent: number; sessionsPrevious: number } {
  const row = payload.channels?.find(
    (c) => c.channel.trim().toLowerCase() === "organic search",
  );
  if (!row) {
    return { sessionsCurrent: 0, sessionsPrevious: 0 };
  }
  return {
    sessionsCurrent: row.sessionsCurrent,
    sessionsPrevious: row.sessionsPrevious,
  };
}

export function gaTrafficAcquisitionMomCsv(
  organic: {
    current: GA4OrganicAcquisitionPeriod;
    previous: GA4OrganicAcquisitionPeriod;
  },
  primary: { start: string; end: string },
  compare: { start: string; end: string },
): string {
  const cur = organic.current;
  const prev = organic.previous;
  const curSessions = cur.sessions;
  const prevSessions = prev.sessions;
  if (
    (Number.isNaN(curSessions) || !Number.isFinite(curSessions)) &&
    (Number.isNaN(prevSessions) || !Number.isFinite(prevSessions))
  ) {
    throw new Error(
      "Organic Search traffic acquisition: missing organic sessions for both periods.",
    );
  }

  const lines: string[] = [
    `# Organic Search traffic acquisition (${primary.start} → ${primary.end} vs ${compare.start} → ${compare.end})`,
    "# Source: GA4 Organic Search channel only (excludes other default channel groups and site-wide totals).",
    "Metric,Period A,Period B,MoM %",
    gaMomMetricRow(
      "Organic sessions",
      gaCountCell(cur.sessions),
      gaCountCell(prev.sessions),
      cur.sessions,
      prev.sessions,
    ),
    gaMomMetricRow(
      "Engaged sessions",
      gaCountCell(cur.engagedSessions),
      gaCountCell(prev.engagedSessions),
      cur.engagedSessions,
      prev.engagedSessions,
    ),
    gaMomMetricRow(
      "Engagement rate",
      gaEngagementRateCell(cur.engagementRate),
      gaEngagementRateCell(prev.engagementRate),
      cur.engagementRate <= 1 ? cur.engagementRate : cur.engagementRate / 100,
      prev.engagementRate <= 1 ? prev.engagementRate : prev.engagementRate / 100,
    ),
    [
      escapeCsvCell("Average engagement time per session"),
      escapeCsvCell(gaDurationCell(cur.averageSessionDurationSec)),
      escapeCsvCell(gaDurationCell(prev.averageSessionDurationSec)),
      escapeCsvCell(
        gaMomPctCell(cur.averageSessionDurationSec, prev.averageSessionDurationSec),
      ),
    ].join(","),
    gaMomMetricRow(
      "Events per session",
      gaDecimalCell(cur.eventsPerSession),
      gaDecimalCell(prev.eventsPerSession),
      cur.eventsPerSession,
      prev.eventsPerSession,
    ),
    gaMomMetricRow(
      "Event count",
      gaCountCell(cur.eventCount),
      gaCountCell(prev.eventCount),
      cur.eventCount,
      prev.eventCount,
    ),
    gaMomMetricRow(
      "Key events",
      gaCountCell(cur.keyEvents),
      gaCountCell(prev.keyEvents),
      cur.keyEvents,
      prev.keyEvents,
    ),
  ];
  return lines.join("\n");
}

export async function fetchGaOrganicTrafficAcquisitionMomFile(
  ranges: GscCompareRanges,
  ga4PropertyId: string,
): Promise<{ name: string; content: string }> {
  const propertyId = ga4PropertyId.trim();
  if (!propertyId) {
    throw new Error("GA4 property ID is required for organic traffic acquisition.");
  }
  const startDateStr = ranges.primary.startDate.trim();
  const endDateStr = ranges.primary.endDate.trim();
  const compareStartDateStr = ranges.compare.startDate.trim();
  const compareEndDateStr = ranges.compare.endDate.trim();
  const gaData = await fetchGaReportDataForReporting(
    getApiBase(),
    propertyId,
    startDateStr,
    endDateStr,
    compareStartDateStr,
    compareEndDateStr,
  );
  const oa = pickGa4OrganicAcquisition(gaData);
  if (!oa?.current || !oa?.previous) {
    throw new Error(
      "GA4 organic acquisition metrics missing. Confirm GA credentials and Property ID.",
    );
  }
  return {
    name: GA_ORGANIC_TRAFFIC_ACQUISITION_MOM_FILENAME,
    content: gaTrafficAcquisitionMomCsv(
      oa,
      { start: startDateStr, end: endDateStr },
      { start: compareStartDateStr, end: compareEndDateStr },
    ),
  };
}

function parseOrganicTrafficAcquisitionMonthlyFromGaData(
  data: GA4ReportData,
): GA4OrganicTrafficAcquisitionMonthlyBlock {
  const block = data.organicTrafficAcquisitionMonthly;
  if (!block?.months?.length || !block.totals) {
    throw new Error(
      "GA4 Organic Search traffic acquisition by month missing. Confirm GA credentials and Property ID.",
    );
  }
  if (!Number.isFinite(block.totals.sessions) || block.totals.sessions <= 0) {
    throw new Error(
      "GA4 Organic Search sessions missing for this report period. Confirm Traffic acquisition access for this property.",
    );
  }
  return block;
}

export async function fetchGaOrganicTrafficAcquisitionByMonthFile(
  primary: { startDate: string; endDate: string },
  compare: { startDate: string; endDate: string },
  ga4PropertyId: string,
): Promise<{ name: string; content: string }> {
  const propertyId = ga4PropertyId.trim();
  if (!propertyId) {
    throw new Error("GA4 property ID is required for Organic Search traffic acquisition.");
  }
  const startDateStr = primary.startDate.trim();
  const endDateStr = primary.endDate.trim();
  const compareStartDateStr = compare.startDate.trim();
  const compareEndDateStr = compare.endDate.trim();
  const gaData = await fetchGaReportDataForReporting(
    getApiBase(),
    propertyId,
    startDateStr,
    endDateStr,
    compareStartDateStr,
    compareEndDateStr,
    { includeOrganicTrafficAcquisitionMonthly: true },
  );
  const block = parseOrganicTrafficAcquisitionMonthlyFromGaData(gaData);
  return {
    name: GA_ORGANIC_TRAFFIC_ACQUISITION_BY_MONTH_FILENAME,
    content: gaOrganicTrafficAcquisitionByMonthCsv(block),
  };
}

async function fetchGaReportDataForReporting(
  apiBase: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  compareStartDate: string,
  compareEndDate: string,
  options?: { includeOrganicTrafficAcquisitionMonthly?: boolean },
): Promise<GA4ReportData & { success?: boolean; error?: string }> {
  const response = await fetch(`${apiBase}/api/ga/report-data`, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      propertyId,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
      includeOrganicTrafficAcquisitionMonthly:
        options?.includeOrganicTrafficAcquisitionMonthly === true,
    }),
  });
  const data = (await response.json()) as GA4ReportData & {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || data.success === false) {
    const base = data.error || `GA report-data HTTP ${response.status}`;
    const email =
      typeof (data as { client_email?: string }).client_email === "string"
        ? (data as { client_email: string }).client_email.trim()
        : "";
    throw new Error(email ? `${base} (Service account: ${email})` : base);
  }
  return data;
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
