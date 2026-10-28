/** Client report / export copy: no em or en dashes; SEO-friendly labels. */

export const CLIENT_REPORT_DELTA_EMPTY = "n/a";

const EM_DASH = /\u2014/g;
const EN_DASH = /\u2013/g;
const UNICODE_DASH = /[\u2010-\u2015\u2212]/g;

export function normalizeClientReportText(value: string): string {
  return value
    .replace(EM_DASH, ", ")
    .replace(EN_DASH, "-")
    .replace(UNICODE_DASH, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeClientReportPeriodLabel(label: string): string {
  return label.replace(EN_DASH, "-").replace(EM_DASH, "-").replace(/\s*→\s*/g, " vs ").trim();
}

export function formatClientReportPeriodLine(
  showCompare: boolean,
  comparePeriodLabel: string,
  primaryPeriodLabel: string,
): string {
  const primary = normalizeClientReportPeriodLabel(primaryPeriodLabel);
  if (!showCompare) return primary;
  const compare = normalizeClientReportPeriodLabel(comparePeriodLabel);
  return `${compare} vs ${primary}`;
}

export function sanitizeClientReportMetricValue(value: string): string {
  if (value.trim() === "\u2014" || value.trim() === "-") return CLIENT_REPORT_DELTA_EMPTY;
  return normalizeClientReportText(value);
}

export function formatClientReportTopQueryMeta(clicks: string): string {
  return `${sanitizeClientReportMetricValue(clicks)} clicks`;
}

export function clientReportSemrushKeywordHasTraffic(traffic: string): boolean {
  const t = sanitizeClientReportMetricValue(traffic);
  if (!t || t === CLIENT_REPORT_DELTA_EMPTY || /^n\/a$/i.test(t)) return false;
  if (t === "0") return false;
  return true;
}

export function formatClientReportSemrushKeywordMeta(traffic: string, volume: string): string {
  const trafficLabel = sanitizeClientReportMetricValue(traffic);
  const volumeLabel = sanitizeClientReportMetricValue(volume);
  const trafficMissing =
    !trafficLabel ||
    trafficLabel === CLIENT_REPORT_DELTA_EMPTY ||
    /^n\/a$/i.test(trafficLabel);
  if (trafficMissing) {
    return `vol. ${volumeLabel}`;
  }
  return `${trafficLabel} est. traffic, vol. ${volumeLabel}`;
}

export function formatClientReportCoverTitle(agencyName: string, siteName: string): string {
  return `${agencyName} | Organic performance report | ${siteName}`;
}

export function formatClientReportCoverMonthYear(periodLine: string): string {
  const normalized = normalizeClientReportText(periodLine);
  const targetPeriod = normalized.includes(" vs ") ? normalized.split(" vs ")[1] : normalized;
  const monthMatch = targetPeriod.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
  );
  const yearMatch = targetPeriod.match(/\b(20\d{2})\b/);
  if (monthMatch && yearMatch) {
    return `${monthMatch[1].toUpperCase()} ${yearMatch[1]}`;
  }
  if (monthMatch) {
    return monthMatch[1].toUpperCase();
  }
  return targetPeriod.toUpperCase() || "REPORT";
}



function capitalizeTitleToken(token: string): string {
  if (!token) return token;
  const prefix = token.match(/^[^a-zA-Z0-9]*/)?.[0] ?? "";
  const suffix = token.match(/[^a-zA-Z0-9]*$/)?.[0] ?? "";
  const core = token.slice(prefix.length, token.length - suffix.length);
  if (!core) return token;
  if (/^[A-Z0-9]{2,}$/.test(core)) return token;
  return prefix + core.charAt(0).toUpperCase() + core.slice(1).toLowerCase() + suffix;
}

/** Every word capitalized (including short words like by, of). Preserves GA4, GSC, etc. */
export function toExportTitleCase(text: string): string {
  const normalized = normalizeClientReportText(text);
  if (!normalized) return normalized;
  return normalized.split(/(\s+)/).map((part) => (/^\s+$/.test(part) ? part : capitalizeTitleToken(part))).join("");
}
