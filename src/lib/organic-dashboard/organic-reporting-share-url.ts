import {
  normalizeReportingSectionId,
  type ReportingSectionId,
} from "@/lib/organic-dashboard/reporting-sections";
import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import {
  buildGa4ReportingRanges,
  type Ga4CompareBaselineId,
  type Ga4PrimaryPresetId,
} from "@/lib/reporting/ga4-analytics-date-ranges";
import type { ReportingCompareRanges } from "@/lib/reporting/reporting-date-presets";
import {
  computeCompareRangesForSpan,
  parseTrailingMonthCount,
  validateReportingCompareFetchRanges,
  validateReportingPrimaryFetchRange,
} from "@/lib/reporting/reporting-date-presets";
import { appendOrganicClientReportClientQuery } from "@/lib/organic-dashboard/organic-client-report-link-preview";
import { buildOrganicClientReportAppPath } from "@/lib/organic-dashboard/organic-client-report-site-path";

export type OrganicReportingShareState = {
  section: ReportingSectionId;
} & Ga4ReportingDateHarness;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const PRIMARY_PRESETS = new Set<Ga4PrimaryPresetId>([
  "today",
  "yesterday",
  "last_7",
  "last_28",
  "last_30",
  "last_60",
  "last_90",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "this_month",
  "this_week_sun",
  "last_week_sun_sat",
  "custom",
]);

const BASELINES = new Set<Ga4CompareBaselineId>([
  "previous_period_match_dow",
  "previous_period",
  "previous_year_match_dow",
  "previous_year",
  "custom",
]);

function parseSection(raw: string | null): ReportingSectionId | null {
  if (!raw) return null;
  return normalizeReportingSectionId(raw);
}

function parsePrimaryPreset(raw: string | null): Ga4PrimaryPresetId | null {
  if (raw && PRIMARY_PRESETS.has(raw as Ga4PrimaryPresetId)) {
    return raw as Ga4PrimaryPresetId;
  }
  return null;
}

function parseBaseline(raw: string | null): Ga4CompareBaselineId | null {
  if (raw && BASELINES.has(raw as Ga4CompareBaselineId)) {
    return raw as Ga4CompareBaselineId;
  }
  return null;
}

function parseStructureCompareEnabled(raw: string | null): boolean {
  if (raw === "filter") return false;
  if (raw === "compare") return true;
  return true;
}

function validateHarness(h: Ga4ReportingDateHarness): boolean {
  const { primary, compare } = h.compareRangeDraft;
  if (!h.compareEnabled) {
    return validateReportingPrimaryFetchRange(primary).ok;
  }
  return validateReportingCompareFetchRanges(primary, compare).ok;
}

export function hasOrganicReportingShareParams(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    params.has("section") ||
    params.has("structure") ||
    params.has("months") ||
    params.has("preset") ||
    params.has("baseline") ||
    params.has("start") ||
    params.has("end")
  );
}

export function parseOrganicReportingShareParams(search: string): OrganicReportingShareState | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!hasOrganicReportingShareParams(search)) return null;

  const section = parseSection(params.get("section")) ?? "performance";
  const compareEnabled = parseStructureCompareEnabled(params.get("structure"));

  const start = params.get("start")?.trim() ?? "";
  const end = params.get("end")?.trim() ?? "";
  const compareStart = params.get("compareStart")?.trim() ?? "";
  const compareEnd = params.get("compareEnd")?.trim() ?? "";

  if (start && end && YMD.test(start) && YMD.test(end)) {
    const primary = { startDate: start, endDate: end };
    const compare =
      compareStart && compareEnd && YMD.test(compareStart) && YMD.test(compareEnd)
        ? { startDate: compareStart, endDate: compareEnd }
        : primary;
    const harness: Ga4ReportingDateHarness = {
      primaryPreset: "custom",
      compareBaseline:
        compareStart && compareEnd ? "custom" : compareEnabled ? "previous_period" : "previous_period",
      compareEnabled,
      compareRangeDraft: { primary, compare },
    };
    if (!validateHarness(harness)) return null;
    return { section, ...harness };
  }

  const preset = parsePrimaryPreset(params.get("preset"));
  const baseline = parseBaseline(params.get("baseline")) ?? "previous_period";

  if (preset) {
    const ranges = buildGa4ReportingRanges({
      primaryPreset: preset,
      primaryCustom: { startDate: "", endDate: "" },
      compareEnabled,
      compareBaseline: baseline,
      compareCustom: { startDate: "", endDate: "" },
    });
    const harness: Ga4ReportingDateHarness = {
      primaryPreset: preset,
      compareBaseline: baseline,
      compareEnabled,
      compareRangeDraft: ranges,
    };
    if (!validateHarness(harness)) return null;
    return { section, ...harness };
  }

  const monthsRaw = params.get("months");
  const trailingMonthCount = monthsRaw != null ? parseTrailingMonthCount(monthsRaw) : 1;
  if (trailingMonthCount == null) return null;

  const legacyRanges = computeCompareRangesForSpan(trailingMonthCount, "previous_period");
  const harness: Ga4ReportingDateHarness = {
    primaryPreset: "custom",
    compareBaseline: "previous_period",
    compareEnabled,
    compareRangeDraft: legacyRanges,
  };
  if (!validateHarness(harness)) return null;
  return { section, ...harness };
}

export function buildOrganicReportingShareSearch(state: OrganicReportingShareState): string {
  const params = new URLSearchParams();
  params.set("section", state.section);
  params.set("structure", state.compareEnabled ? "compare" : "filter");

  if (state.primaryPreset === "custom" || state.compareBaseline === "custom") {
    params.set("start", state.compareRangeDraft.primary.startDate);
    params.set("end", state.compareRangeDraft.primary.endDate);
    if (state.compareEnabled) {
      params.set("compareStart", state.compareRangeDraft.compare.startDate);
      params.set("compareEnd", state.compareRangeDraft.compare.endDate);
    }
  } else {
    params.set("preset", state.primaryPreset);
    if (state.compareEnabled) {
      params.set("baseline", state.compareBaseline);
    }
  }

  return params.toString();
}

export function buildOrganicReportingShareUrl(
  siteId: string,
  state: OrganicReportingShareState,
  origin?: string,
): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = `${basePath}/sites/${encodeURIComponent(siteId)}/organic`;
  const qs = buildOrganicReportingShareSearch(state);
  return `${base}${path}?${qs}`;
}

/** Client-facing printer report; same date/section query string as Performance share links. */
export function buildOrganicClientReportShareUrl(
  siteId: string,
  state: OrganicReportingShareState,
  origin?: string,
  siteDisplayName?: string,
): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const qs = appendOrganicClientReportClientQuery(
    buildOrganicReportingShareSearch(state),
    siteDisplayName?.trim() ?? "",
  );
  const path = buildOrganicClientReportAppPath({
    siteId,
    siteDisplayName: siteDisplayName?.trim() || siteId,
    search: qs,
  });
  return `${base}${path}`;
}

export function shareStateFromDateHarness(
  section: ReportingSectionId,
  harness: Ga4ReportingDateHarness,
): OrganicReportingShareState {
  return { section, ...harness };
}

export type { ReportingCompareRanges };
