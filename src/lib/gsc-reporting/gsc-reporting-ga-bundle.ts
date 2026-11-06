/**
 * GA4 organic traffic acquisition bundle files for GSC reporting.
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
import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";
import { escapeCsvCell } from "@/lib/gsc-reporting/gsc-reporting-csv-serializers";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export function getApiBase(): string {
  return BACKEND_API_BASE;
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

export async function pushGaOrganicFilesOntoBundle(
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
