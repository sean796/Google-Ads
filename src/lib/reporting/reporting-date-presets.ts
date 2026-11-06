/**
 * Shared reporting date presets reporting fetch (month-over-month by default).
 * Period A = last full calendar month; period B = the full month before that (standard MoM).
 */

import { calculateMonthToMonth, calculateYearOverYear, formatDateForAPI } from "@/lib/gsc-date-helpers";

export const REPORTING_TRAILING_MONTH_PRESETS = ["m3", "m6", "m12"] as const;
export type TrailingMonthsPresetId = (typeof REPORTING_TRAILING_MONTH_PRESETS)[number];

export type ReportingComparePresetId =
  | "mom"
  | "yoy"
  | TrailingMonthsPresetId
  | "custom_compare";

/** GA4-style compare baseline for preset spans (not manual custom dates). */
export type CompareBasis = "previous_period" | "previous_year";

export const REPORTING_COMPARE_BASIS_OPTIONS: { id: CompareBasis; label: string }[] = [
  { id: "previous_period", label: "Previous period" },
  { id: "previous_year", label: "Previous year" },
];

export type ReportStructureUi = "compare" | "period_progress";

export const REPORTING_REPORT_STRUCTURE_OPTIONS: { id: ReportStructureUi; label: string }[] = [
  { id: "compare", label: "Compare periods" },
  { id: "period_progress", label: "This period progress" },
];

const TRAILING_MONTH_COUNTS: Record<TrailingMonthsPresetId, number> = {
  m3: 3,
  m6: 6,
  m12: 12,
};

export const REPORTING_LAST_MONTH_PRESETS = [1, 2, 3, 6, 9, 12] as const;

export function isReportingPresetMonthCount(n: number): boolean {
  return (REPORTING_LAST_MONTH_PRESETS as readonly number[]).includes(n);
}

export function formatReportingLastMonthsLabel(monthCount: number): string {
  return monthCount === 1 ? "Last 1 month" : `Last ${monthCount} months`;
}

export function formatReportingDateMenuTriggerLabel(
  structure: ReportStructureUi,
  trailingMonthCount: number | null,
  fetchPreset: ReportingComparePresetId,
  primary: { startDate: string; endDate: string },
): string {
  if (fetchPreset === "custom_compare") {
    return formatComparePeriodLabel(primary.startDate, primary.endDate);
  }
  const n = trailingMonthCount ?? 1;
  const span = formatReportingLastMonthsLabel(n);
  return structure === "period_progress" ? span : `${span} · Compare`;
}

export const REPORTING_COMPARE_PRESET_OPTIONS: { id: ReportingComparePresetId; label: string }[] = [
  { id: "mom", label: "1 vs 1" },
  { id: "m3", label: "3 vs 3" },
  { id: "m6", label: "6 vs 6" },
  { id: "m12", label: "12 vs 12" },
  { id: "custom_compare", label: "Custom dates…" },
];

export const REPORTING_COMPARE_SPAN_LABEL: Record<
  "mom" | TrailingMonthsPresetId,
  string
> = {
  mom: "1 vs 1",
  m3: "3 vs 3",
  m6: "6 vs 6",
  m12: "12 vs 12",
};

export function monthSpanFromComparePreset(preset: ReportingComparePresetId): number | null {
  if (preset === "mom" || preset === "yoy") return 1;
  if (isTrailingMonthsPreset(preset)) return TRAILING_MONTH_COUNTS[preset];
  return null;
}

function shiftIsoRangeBackOneYear(range: { startDate: string; endDate: string }): {
  startDate: string;
  endDate: string;
} {
  const start = parseReportingYmd(range.startDate);
  const end = parseReportingYmd(range.endDate);
  if (!start || !end) return range;
  const compareStart = new Date(start);
  compareStart.setFullYear(compareStart.getFullYear() - 1);
  const compareEnd = new Date(end);
  compareEnd.setFullYear(compareEnd.getFullYear() - 1);
  return {
    startDate: formatDateForAPI(compareStart),
    endDate: formatDateForAPI(compareEnd),
  };
}

/** Last N full calendar months vs the same N months one year earlier. */
export function computeTrailingFullMonthsYearOverYearCompareRanges(
  monthCount: number,
  reference: Date = new Date(),
): ReportingCompareRanges {
  const primaryBlock = computeTrailingFullMonthsCompareRanges(monthCount, reference);
  return {
    primary: primaryBlock.primary,
    compare: shiftIsoRangeBackOneYear(primaryBlock.primary),
  };
}

export function computeCompareRangesForSpan(
  monthCount: number,
  basis: CompareBasis,
  reference: Date = new Date(),
): ReportingCompareRanges {
  if (basis === "previous_year") {
    if (monthCount === 1) return computeYoyCompareRanges(reference);
    return computeTrailingFullMonthsYearOverYearCompareRanges(monthCount, reference);
  }
  if (monthCount === 1) return computeMomCompareRanges(reference);
  return computeTrailingFullMonthsCompareRanges(monthCount, reference);
}

export function isTrailingMonthsPreset(preset: string): preset is TrailingMonthsPresetId {
  return (REPORTING_TRAILING_MONTH_PRESETS as readonly string[]).includes(preset);
}

/** True when the UI/run must send computed ranges (not mom/yoy built-in fetch). */
export function comparePresetPassesRanges(preset: ReportingComparePresetId): boolean {
  return preset !== "mom" && preset !== "yoy";
}

export type ReportingCompareRanges = {
  primary: { startDate: string; endDate: string };
  compare: { startDate: string; endDate: string };
};

/**
 * Last complete calendar month vs the full month before it (same logic as month-to-month reports elsewhere).
 */
export function computeMomCompareRanges(reference: Date = new Date()): ReportingCompareRanges {
  const r = calculateMonthToMonth(reference);
  return {
    primary: {
      startDate: formatDateForAPI(r.current.startDate),
      endDate: formatDateForAPI(r.current.endDate),
    },
    compare: {
      startDate: formatDateForAPI(r.comparison.startDate),
      endDate: formatDateForAPI(r.comparison.endDate),
    },
  };
}

/** Last complete calendar month vs the same calendar month one year earlier. */
export function computeYoyCompareRanges(reference: Date = new Date()): ReportingCompareRanges {
  const mom = calculateMonthToMonth(reference);
  const r = calculateYearOverYear(mom.current.startDate, mom.current.endDate);
  return {
    primary: {
      startDate: formatDateForAPI(r.current.startDate),
      endDate: formatDateForAPI(r.current.endDate),
    },
    compare: {
      startDate: formatDateForAPI(r.comparison.startDate),
      endDate: formatDateForAPI(r.comparison.endDate),
    },
  };
}

/**
 * Last `monthCount` complete calendar months vs the `monthCount` full months before that.
 * Example with 3 months on 13 Apr 2026: Jan–Mar 2026 vs Oct–Dec 2025.
 */
export function computeTrailingFullMonthsCompareRanges(
  monthCount: number,
  reference: Date = new Date(),
): ReportingCompareRanges {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const primaryEnd = new Date(y, m, 0);
  const primaryStart = new Date(primaryEnd.getFullYear(), primaryEnd.getMonth() - (monthCount - 1), 1);
  const compareEnd = new Date(primaryStart.getFullYear(), primaryStart.getMonth(), 0);
  const compareStart = new Date(compareEnd.getFullYear(), compareEnd.getMonth() - (monthCount - 1), 1);
  return {
    primary: {
      startDate: formatDateForAPI(primaryStart),
      endDate: formatDateForAPI(primaryEnd),
    },
    compare: {
      startDate: formatDateForAPI(compareStart),
      endDate: formatDateForAPI(compareEnd),
    },
  };
}

export function computeCompareRangesForPreset(
  preset: ReportingComparePresetId,
  reference: Date = new Date(),
  basis: CompareBasis = "previous_period",
): ReportingCompareRanges {
  if (preset === "yoy") return computeCompareRangesForSpan(1, "previous_year", reference);
  const span = monthSpanFromComparePreset(preset);
  if (span != null) return computeCompareRangesForSpan(span, basis, reference);
  return computeMomCompareRanges(reference);
}

export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Human-readable range from YYYY-MM-DD pair, e.g. "May 1–31, 2026". */
export function formatComparePeriodLabel(startDate: string, endDate: string): string {
  const start = parseReportingYmd(startDate);
  const end = parseReportingYmd(endDate);
  if (!start || !end) return `${startDate} → ${endDate}`;

  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (start.getFullYear() === year) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}–${endDay}, ${year}`;
    }
    const startPart = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endPart = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startPart} – ${endPart}, ${year}`;
  }

  const startPart = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endPart = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startPart} – ${endPart}`;
}

/** Workspace report list title: compare uses month-year pair; period progress uses primary range only. */
export function formatReportingRowTitle(
  primary: { startDate: string; endDate: string },
  compareStartYmd: string,
  reportStructure: ReportStructureUi,
): string {
  if (reportStructure === "period_progress") {
    return formatComparePeriodLabel(primary.startDate, primary.endDate);
  }
  return formatCompareMonthYearPair(primary.startDate, compareStartYmd);
}

/** Report H1 span, e.g. "July 2026 to September 2026" (month + year only). */
export function formatReportTitleMonthYearSpan(startDate: string, endDate: string): string {
  const start = parseReportingYmd(startDate);
  const end = parseReportingYmd(endDate);
  if (!start || !end) return `${startDate} to ${endDate}`;
  const startLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} to ${endLabel}`;
}

/** Report row label, e.g. "September 2026 vs August 2026" (month + year only). */
export function formatCompareMonthYearPair(primaryStartYmd: string, compareStartYmd: string): string {
  const monthYear = (ymd: string): string => {
    const d = parseReportingYmd(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };
  return `${monthYear(primaryStartYmd)} vs ${monthYear(compareStartYmd)}`;
}

/** Full picker range for the report H1 and first paragraph, e.g. "April 1, 2026 to April 30, 2026". */
export function formatReportFullDateRange(startDate: string, endDate: string): string {
  const start = parseReportingYmd(startDate);
  const end = parseReportingYmd(endDate);
  if (!start || !end) return `${startDate} to ${endDate}`;
  const startPart = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const endPart = end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${startPart} to ${endPart}`;
}

export function parseReportingYmd(ymd: string): Date | null {
  const trimmed = ymd.trim();
  if (!YMD_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const TRAILING_MONTH_COUNT_MIN = 1;
export const TRAILING_MONTH_COUNT_MAX = 36;

/** Parse a trailing-month count for last N full months vs the N before. */
export function parseTrailingMonthCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < TRAILING_MONTH_COUNT_MIN || n > TRAILING_MONTH_COUNT_MAX) {
    return null;
  }
  return n;
}

export function formatTrailingMonthsTriggerLabel(monthCount: number): string {
  return `${monthCount} vs ${monthCount}`;
}

export function formatProgressSpanTriggerLabel(monthCount: number): string {
  return monthCount === 1 ? "1 month" : `${monthCount} months`;
}

export function formatReportingProgressToolbarTriggerLabel(spanLabel: string): string {
  return `${spanLabel} · Progress`;
}

export function formatReportingCompareToolbarTriggerLabel(
  spanLabel: string,
  basis: CompareBasis,
  customDates: boolean,
): string {
  if (customDates) return "Custom dates";
  const basisShort = basis === "previous_year" ? "Prior year" : "Prior period";
  return `${spanLabel} · ${basisShort}`;
}

function validateOneRange(startDate: string, endDate: string): { ok: true } | { ok: false; error: string } {
  const a = startDate.trim();
  const b = endDate.trim();
  if (!YMD_RE.test(a) || !YMD_RE.test(b)) {
    return { ok: false, error: "Use YYYY-MM-DD for all dates." };
  }
  if (a >= b) {
    return { ok: false, error: "Each period: start date must be before end date." };
  }
  const todayYmd = formatLocalYmd(new Date());
  if (b > todayYmd) {
    return { ok: false, error: "End date cannot be in the future." };
  }
  return { ok: true };
}

/** Validate both date ranges before calling the API. */
export function validateReportingCompareFetchRanges(
  primary: { startDate: string; endDate: string },
  compare: { startDate: string; endDate: string },
): { ok: true } | { ok: false; error: string } {
  const p = validateOneRange(primary.startDate, primary.endDate);
  if (!p.ok) return p;
  const c = validateOneRange(compare.startDate, compare.endDate);
  if (!c.ok) return c;
  return { ok: true };
}

/** Validate primary range only (period progress reporting). */
export function validateReportingPrimaryFetchRange(
  primary: { startDate: string; endDate: string },
): { ok: true } | { ok: false; error: string } {
  return validateOneRange(primary.startDate, primary.endDate);
}

/** Count distinct calendar months touched by an inclusive date range. */
export function countCalendarMonthsInRange(startDate: string, endDate: string): number {
  const start = parseReportingYmd(startDate);
  const end = parseReportingYmd(endDate);
  if (!start || !end || start > end) return 0;
  let count = 0;
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    count += 1;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return count;
}
