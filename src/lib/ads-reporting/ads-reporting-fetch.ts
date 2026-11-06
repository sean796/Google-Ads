import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { WordPressSite } from "@/components/integrations/types";
import type { AdsReportingDateRanges } from "@/lib/ads-reporting/ads-reporting-types";
import { resolveGoogleAdsCustomerIdForReportingAsync } from "@/lib/ads-reporting/ads-reporting-metrics";
import { csvNumberCell, formatCanadianNumber } from "@/lib/reporting/reporting-number-format";
import { compactPeriodLabelFromIsoRange } from "@/lib/reporting/reporting-period-labels";
import {
  deriveAdsCompareSignals,
  deriveAdsPeriodSignals,
  adsCompareSignalsFileContent,
} from "@/lib/ads-reporting/ads-reporting-compare-signals";
import type { AdsReportingCompareKind } from "@/lib/ads-reporting/ads-reporting-types";
import { adsCpa, adsPctDelta, microsToSpend, normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";
import type {
  AdsCampaignRow,
  AdsKeywordRow,
  AdsMetrics,
  AdsReportingBundle,
  AdsSearchTermRow,
} from "@/lib/ads-reporting/ads-reporting-types";

export const ADS_SITE_TOTALS_FILENAME = "Ads-site-totals-MoM.csv";
export const ADS_CAMPAIGNS_FILENAME = "Ads-campaigns-MoM.csv";
export const ADS_KEYWORDS_FILENAME = "Ads-keywords-MoM.csv";
export const ADS_SEARCH_TERMS_FILENAME = "Ads-search-terms-MoM.csv";
export const ADS_SITE_TOTALS_PERIOD_FILENAME = "Ads-site-totals-Period.csv";
export const ADS_CAMPAIGNS_PERIOD_FILENAME = "Ads-campaigns-Period.csv";
export const ADS_KEYWORDS_PERIOD_FILENAME = "Ads-keywords-Period.csv";
export const ADS_SEARCH_TERMS_PERIOD_FILENAME = "Ads-search-terms-Period.csv";
export const ADS_COMPARE_SIGNALS_FILENAME = "Ads-compare-signals.txt";

export { adsCpa, adsPctDelta, microsToSpend, normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatPct(n: number): string {
  return `${formatCanadianNumber(n <= 1 && n >= 0 ? n * 100 : n)}%`;
}

function formatMoney(costMicros: number): string {
  return csvNumberCell(microsToSpend(costMicros));
}

function formatDeltaCell(primary: number, compare: number): string {
  const d = adsPctDelta(primary, compare);
  if (d == null) return " - ";
  return csvNumberCell(d);
}

export function buildAdsSiteTotalsCsv(
  primary: AdsMetrics,
  compare: AdsMetrics,
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const lb = compactPeriodLabelFromIsoRange(compareRange.start, compareRange.end);
  const pSpend = microsToSpend(primary.costMicros);
  const cSpend = microsToSpend(compare.costMicros);
  const pCpa = adsCpa(primary.costMicros, primary.conversions);
  const cCpa = adsCpa(compare.costMicros, compare.conversions);
  const header = [
    "Metric",
    `${la}`,
    `${lb}`,
    "Δ%",
  ].join(",");
  const rows: Array<[string, string, string, string]> = [
    ["Spend", csvNumberCell(pSpend), csvNumberCell(cSpend), formatDeltaCell(pSpend, cSpend)],
    ["Clk", csvNumberCell(primary.clicks), csvNumberCell(compare.clicks), formatDeltaCell(primary.clicks, compare.clicks)],
    ["Imp", csvNumberCell(primary.impressions), csvNumberCell(compare.impressions), formatDeltaCell(primary.impressions, compare.impressions)],
    ["CTR", formatPct(primary.ctr), formatPct(compare.ctr), formatDeltaCell(primary.ctr, compare.ctr)],
    ["CPC", formatMoney(primary.averageCpc), formatMoney(compare.averageCpc), formatDeltaCell(primary.averageCpc, compare.averageCpc)],
    ["Conv", csvNumberCell(primary.conversions), csvNumberCell(compare.conversions), formatDeltaCell(primary.conversions, compare.conversions)],
    ["CPA", pCpa == null ? " - " : csvNumberCell(pCpa), cCpa == null ? " - " : csvNumberCell(cCpa), pCpa != null && cCpa != null ? formatDeltaCell(pCpa, cCpa) : " - "],
  ];
  return [header, ...rows.map((r) => r.join(","))].join("\n");
}

export function buildAdsSiteTotalsPeriodCsv(
  primary: AdsMetrics,
  primaryRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const pSpend = microsToSpend(primary.costMicros);
  const pCpa = adsCpa(primary.costMicros, primary.conversions);
  const header = ["Metric", la].join(",");
  const rows: Array<[string, string]> = [
    ["Spend", csvNumberCell(pSpend)],
    ["Clk", csvNumberCell(primary.clicks)],
    ["Imp", csvNumberCell(primary.impressions)],
    ["CTR", formatPct(primary.ctr)],
    ["CPC", formatMoney(primary.averageCpc)],
    ["Conv", csvNumberCell(primary.conversions)],
    ["CPA", pCpa == null ? " - " : csvNumberCell(pCpa)],
  ];
  return [
    "# Account totals for the full report period. No prior-period or Δ% columns.",
    "#",
    header,
    ...rows.map((r) => r.join(",")),
  ].join("\n");
}

export function buildAdsCampaignsPeriodCsv(
  primary: AdsCampaignRow[],
  primaryRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const header = ["Campaign", `Spend (${la})`, `Clk (${la})`, `Conv (${la})`].join(",");
  const sorted = [...primary].sort((a, b) => b.costMicros - a.costMicros);
  const rows = sorted.slice(0, 250).map((row) =>
    [
      escapeCsvCell(row.name),
      formatMoney(row.costMicros),
      csvNumberCell(row.clicks),
      csvNumberCell(row.conversions),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export function buildAdsKeywordsPeriodCsv(
  primary: AdsKeywordRow[],
  primaryRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const header = ["Keyword", "Campaign", `Spend (${la})`, `Clk (${la})`].join(",");
  const sorted = [...primary].sort((a, b) => b.costMicros - a.costMicros);
  const rows = sorted.slice(0, 250).map((row) =>
    [
      escapeCsvCell(row.text),
      escapeCsvCell(row.campaignName),
      formatMoney(row.costMicros),
      csvNumberCell(row.clicks),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export function buildAdsSearchTermsPeriodCsv(
  primary: AdsSearchTermRow[],
  primaryRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const header = ["Search term", "Campaign", `Spend (${la})`, `Clk (${la})`].join(",");
  const sorted = [...primary].sort((a, b) => b.costMicros - a.costMicros);
  const rows = sorted.slice(0, 250).map((row) =>
    [
      escapeCsvCell(row.searchTerm),
      escapeCsvCell(row.campaignName),
      formatMoney(row.costMicros),
      csvNumberCell(row.clicks),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function joinByName<T extends { name?: string; text?: string; searchTerm?: string }>(
  primary: T[],
  compare: T[],
  keyOf: (row: T) => string,
): Array<{ key: string; p?: T; c?: T }> {
  const map = new Map<string, { key: string; p?: T; c?: T }>();
  for (const row of primary) {
    const key = keyOf(row).trim();
    if (!key) continue;
    map.set(key, { ...(map.get(key) ?? { key }), p: row });
  }
  for (const row of compare) {
    const key = keyOf(row).trim();
    if (!key) continue;
    map.set(key, { ...(map.get(key) ?? { key }), c: row });
  }
  return [...map.values()];
}

export function buildAdsCampaignsMomCsv(
  primary: AdsCampaignRow[],
  compare: AdsCampaignRow[],
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const lb = compactPeriodLabelFromIsoRange(compareRange.start, compareRange.end);
  const header = [
    "Campaign",
    `Spend (${la})`,
    `Spend (${lb})`,
    "Spend Δ%",
    `Clk (${la})`,
    `Clk (${lb})`,
    "Clk Δ%",
    `Conv (${la})`,
    `Conv (${lb})`,
    "Conv Δ%",
  ].join(",");
  const joined = joinByName(primary, compare, (r) => r.name);
  joined.sort((a, b) => (b.p?.costMicros ?? 0) - (a.p?.costMicros ?? 0));
  const rows = joined.slice(0, 250).map((row) => {
    const p = row.p;
    const c = row.c;
    return [
      escapeCsvCell(row.key),
      p ? formatMoney(p.costMicros) : " - ",
      c ? formatMoney(c.costMicros) : " - ",
      p && c ? formatDeltaCell(microsToSpend(p.costMicros), microsToSpend(c.costMicros)) : " - ",
      p ? csvNumberCell(p.clicks) : " - ",
      c ? csvNumberCell(c.clicks) : " - ",
      p && c ? formatDeltaCell(p.clicks, c.clicks) : " - ",
      p ? csvNumberCell(p.conversions) : " - ",
      c ? csvNumberCell(c.conversions) : " - ",
      p && c ? formatDeltaCell(p.conversions, c.conversions) : " - ",
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function buildAdsKeywordsMomCsv(
  primary: AdsKeywordRow[],
  compare: AdsKeywordRow[],
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const lb = compactPeriodLabelFromIsoRange(compareRange.start, compareRange.end);
  const header = [
    "Keyword",
    "Campaign",
    `Spend (${la})`,
    `Spend (${lb})`,
    "Spend Δ%",
    `Clk (${la})`,
    `Clk Δ%`,
  ].join(",");
  const joined = joinByName(primary, compare, (r) => `${r.text}||${r.campaignName}`);
  joined.sort((a, b) => (b.p?.costMicros ?? 0) - (a.p?.costMicros ?? 0));
  const rows = joined.slice(0, 250).map((row) => {
    const p = row.p;
    const c = row.c;
    const label = p?.text || c?.text || row.key.split("||")[0] || "";
    const campaign = p?.campaignName || c?.campaignName || "";
    return [
      escapeCsvCell(label),
      escapeCsvCell(campaign),
      p ? formatMoney(p.costMicros) : " - ",
      c ? formatMoney(c.costMicros) : " - ",
      p && c ? formatDeltaCell(microsToSpend(p.costMicros), microsToSpend(c.costMicros)) : " - ",
      p ? csvNumberCell(p.clicks) : " - ",
      p && c ? formatDeltaCell(p.clicks, c.clicks) : " - ",
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function buildAdsSearchTermsMomCsv(
  primary: AdsSearchTermRow[],
  compare: AdsSearchTermRow[],
  primaryRange: { start: string; end: string },
  compareRange: { start: string; end: string },
): string {
  const la = compactPeriodLabelFromIsoRange(primaryRange.start, primaryRange.end);
  const lb = compactPeriodLabelFromIsoRange(compareRange.start, compareRange.end);
  const header = [
    "Search term",
    "Campaign",
    `Spend (${la})`,
    `Spend (${lb})`,
    "Spend Δ%",
    `Clk (${la})`,
    `Clk Δ%`,
  ].join(",");
  const joined = joinByName(primary, compare, (r) => `${r.searchTerm}||${r.campaignName}`);
  joined.sort((a, b) => (b.p?.costMicros ?? 0) - (a.p?.costMicros ?? 0));
  const rows = joined.slice(0, 250).map((row) => {
    const p = row.p;
    const c = row.c;
    const label = p?.searchTerm || c?.searchTerm || row.key.split("||")[0] || "";
    const campaign = p?.campaignName || c?.campaignName || "";
    return [
      escapeCsvCell(label),
      escapeCsvCell(campaign),
      p ? formatMoney(p.costMicros) : " - ",
      c ? formatMoney(c.costMicros) : " - ",
      p && c ? formatDeltaCell(microsToSpend(p.costMicros), microsToSpend(c.costMicros)) : " - ",
      p ? csvNumberCell(p.clicks) : " - ",
      p && c ? formatDeltaCell(p.clicks, c.clicks) : " - ",
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function adsBundleHasActivity(bundle: AdsReportingBundle): boolean {
  const a = bundle.account;
  return a.impressions > 0 || a.clicks > 0 || a.costMicros > 0 || bundle.campaigns.length > 0;
}

export function filesFromAdsReportingBundle(
  bundle: AdsReportingBundle,
  compareKind: AdsReportingCompareKind,
  compareLabel: string,
): { name: string; content: string }[] {
  const primaryRange = { start: bundle.startDate, end: bundle.endDate };
  const compareRange = { start: bundle.compareStartDate, end: bundle.compareEndDate };
  if (compareKind === "period_progress") {
    const files = [
      {
        name: ADS_SITE_TOTALS_PERIOD_FILENAME,
        content: buildAdsSiteTotalsPeriodCsv(bundle.account, primaryRange),
      },
      {
        name: ADS_CAMPAIGNS_PERIOD_FILENAME,
        content: buildAdsCampaignsPeriodCsv(bundle.campaigns, primaryRange),
      },
      {
        name: ADS_KEYWORDS_PERIOD_FILENAME,
        content: buildAdsKeywordsPeriodCsv(bundle.keywords, primaryRange),
      },
      {
        name: ADS_SEARCH_TERMS_PERIOD_FILENAME,
        content: buildAdsSearchTermsPeriodCsv(bundle.searchTerms, primaryRange),
      },
    ];
    const signals = deriveAdsPeriodSignals({ compareLabel, primary: bundle.account });
    files.push({ name: ADS_COMPARE_SIGNALS_FILENAME, content: adsCompareSignalsFileContent(signals) });
    return files;
  }
  const files = [
    {
      name: ADS_SITE_TOTALS_FILENAME,
      content: buildAdsSiteTotalsCsv(bundle.account, bundle.compareAccount, primaryRange, compareRange),
    },
    {
      name: ADS_CAMPAIGNS_FILENAME,
      content: buildAdsCampaignsMomCsv(bundle.campaigns, bundle.compareCampaigns, primaryRange, compareRange),
    },
    {
      name: ADS_KEYWORDS_FILENAME,
      content: buildAdsKeywordsMomCsv(bundle.keywords, bundle.compareKeywords, primaryRange, compareRange),
    },
    {
      name: ADS_SEARCH_TERMS_FILENAME,
      content: buildAdsSearchTermsMomCsv(bundle.searchTerms, bundle.compareSearchTerms, primaryRange, compareRange),
    },
  ];
  const signals = deriveAdsCompareSignals({
    compareKind,
    compareLabel,
    primary: bundle.account,
    compare: bundle.compareAccount,
  });
  files.push({ name: ADS_COMPARE_SIGNALS_FILENAME, content: adsCompareSignalsFileContent(signals) });
  return files;
}

export async function fetchAdsReportingBundle(
  customerId: string,
  ranges: AdsReportingDateRanges,
  options?: {
    site?: WordPressSite;
    siteId?: string;
    compareKind?: AdsReportingCompareKind;
    compareLabel?: string;
    reportStructure?: "compare" | "period_progress";
  },
): Promise<{
  files: { name: string; content: string }[];
  startDate: string;
  endDate: string;
  compareStartDate: string;
  compareEndDate: string;
}> {
  let id = normalizeGoogleAdsCustomerId(customerId);
  if (id.length !== 10 && options?.site) {
    id = await resolveGoogleAdsCustomerIdForReportingAsync(options.site);
  }
  const periodProgress = options?.reportStructure === "period_progress";
  const body: Record<string, string> = {
    customerId: id,
    startDate: ranges.primary.startDate,
    endDate: ranges.primary.endDate,
  };
  const siteId = (options?.siteId ?? options?.site?.id ?? "").trim();
  if (siteId) {
    body.siteId = siteId;
  }
  if (periodProgress) {
    body.reportStructure = "period_progress";
  } else {
    body.compareStartDate = ranges.compare.startDate;
    body.compareEndDate = ranges.compare.endDate;
  }
  const res = await fetch(backendApiUrl("/google-ads/fetch-reporting-bundle"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as AdsReportingBundle | { success?: false; error?: string };
  if (!("success" in data) || data.success !== true) {
    const err = "error" in data && typeof data.error === "string" ? data.error : "Ads reporting bundle failed.";
    throw new Error(err);
  }
  const compareKind = options?.compareKind ?? "mom";
  const compareLabel =
    options?.compareLabel ??
    `${compactPeriodLabelFromIsoRange(data.startDate, data.endDate)} vs ${compactPeriodLabelFromIsoRange(data.compareStartDate, data.compareEndDate)}`;
  return {
    files: filesFromAdsReportingBundle(data, compareKind, compareLabel),
    startDate: data.startDate,
    endDate: data.endDate,
    compareStartDate: data.compareStartDate,
    compareEndDate: data.compareEndDate,
  };
}
