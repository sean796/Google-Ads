import {
  calculateSimilarTimeframe,
  calculateYearOverYear,
  formatDateForAPI,
} from "@/lib/gsc-date-helpers";
import {
  computeTrailingFullMonthsCompareRanges,
  type ReportingCompareRanges,
} from "@/lib/reporting/reporting-date-presets";

export type Ga4PrimaryPresetId =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_28"
  | "last_30"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "this_month"
  | "this_week_sun"
  | "this_week_mon"
  | "last_week_sun_sat"
  | "last_week_mon_sat"
  | "custom";

export type Ga4CompareBaselineId =
  | "previous_period_match_dow"
  | "previous_period"
  | "previous_year_match_dow"
  | "previous_year"
  | "custom";

/** GA4 UI order (Custom first, then standard list). */
export const GA4_PRIMARY_PRESET_OPTIONS: { id: Ga4PrimaryPresetId; label: string; submenu?: boolean }[] = [
  { id: "custom", label: "Custom" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week_sun", label: "This week (Sun – Today)", submenu: true },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_week_sun_sat", label: "Last week (Sun – Sat)", submenu: true },
  { id: "last_28", label: "Last 28 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "last_6_months", label: "Last 6 months" },
  { id: "last_12_months", label: "Last 12 months" },
  { id: "this_month", label: "This month" },
];

export const GA4_COMPARE_BASELINE_OPTIONS: { id: Ga4CompareBaselineId; label: string }[] = [
  { id: "previous_period_match_dow", label: "Previous period (match day of week)" },
  { id: "previous_period", label: "Previous period" },
  { id: "previous_year_match_dow", label: "Previous year (match day of week)" },
  { id: "previous_year", label: "Previous year" },
  { id: "custom", label: "Custom" },
];

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function capEndAtReference(end: Date, reference: Date): Date {
  const cap = startOfLocalDay(reference);
  const e = startOfLocalDay(end);
  return e > cap ? cap : e;
}

function toYmdRange(start: Date, end: Date): { startDate: string; endDate: string } {
  const s = startOfLocalDay(start);
  const e = startOfLocalDay(end);
  return {
    startDate: formatDateForAPI(s),
    endDate: formatDateForAPI(e),
  };
}

function inclusiveDayCount(start: Date, end: Date): number {
  const s = startOfLocalDay(start).getTime();
  const e = startOfLocalDay(end).getTime();
  return Math.round((e - s) / 86400000) + 1;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Sunday 00:00 of the week containing `d` (US GA4 default). */
function sundayOfWeekContaining(d: Date): Date {
  const x = startOfLocalDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

/** Monday 00:00 of the week containing `d` (ISO-style week start). */
function mondayOfWeekContaining(d: Date): Date {
  const x = startOfLocalDay(d);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

function trailingFullMonthsPrimary(monthCount: number, reference: Date): { startDate: string; endDate: string } {
  return computeTrailingFullMonthsCompareRanges(monthCount, reference).primary;
}

export function computeGa4PrimaryRange(
  preset: Ga4PrimaryPresetId,
  reference: Date = new Date(),
): { startDate: string; endDate: string } {
  const ref = startOfLocalDay(reference);

  if (preset === "custom") {
    const end = ref;
    const start = addDays(ref, -27);
    return toYmdRange(start, end);
  }

  if (preset === "today") {
    return toYmdRange(ref, ref);
  }

  if (preset === "yesterday") {
    const y = addDays(ref, -1);
    return toYmdRange(y, y);
  }

  if (preset === "last_7") {
    return toYmdRange(addDays(ref, -6), ref);
  }

  if (preset === "last_28") {
    return toYmdRange(addDays(ref, -27), ref);
  }

  if (preset === "last_30") {
    return toYmdRange(addDays(ref, -29), ref);
  }

  if (preset === "last_month") {
    const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth(), 0);
    return toYmdRange(start, end);
  }

  if (preset === "last_3_months") {
    return trailingFullMonthsPrimary(3, ref);
  }

  if (preset === "last_6_months") {
    return trailingFullMonthsPrimary(6, ref);
  }

  if (preset === "last_12_months") {
    return trailingFullMonthsPrimary(12, ref);
  }

  if (preset === "this_month") {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    return toYmdRange(start, ref);
  }

  if (preset === "this_week_sun") {
    const start = sundayOfWeekContaining(ref);
    return toYmdRange(start, ref);
  }

  if (preset === "last_week_sun_sat") {
    const thisSun = sundayOfWeekContaining(ref);
    const lastSun = addDays(thisSun, -7);
    const lastSat = addDays(thisSun, -1);
    return toYmdRange(lastSun, lastSat);
  }

  if (preset === "this_week_mon") {
    const start = mondayOfWeekContaining(ref);
    return toYmdRange(start, ref);
  }

  if (preset === "last_week_mon_sat") {
    const thisMon = mondayOfWeekContaining(ref);
    const lastMon = addDays(thisMon, -7);
    const lastSun = addDays(thisMon, -1);
    return toYmdRange(lastMon, lastSun);
  }

  return toYmdRange(addDays(ref, -6), ref);
}

function parseYmdLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function computeGa4CompareRange(
  primary: { startDate: string; endDate: string },
  baseline: Ga4CompareBaselineId,
): { startDate: string; endDate: string } {
  const pStart = parseYmdLocal(primary.startDate);
  const pEnd = parseYmdLocal(primary.endDate);
  if (!pStart || !pEnd || pStart > pEnd) {
    return { startDate: primary.startDate, endDate: primary.endDate };
  }

  const length = inclusiveDayCount(pStart, pEnd);

  if (baseline === "previous_period_match_dow") {
    const compareEnd = addDays(pStart, -7);
    const compareStart = addDays(compareEnd, -(length - 1));
    return toYmdRange(compareStart, compareEnd);
  }

  if (baseline === "previous_period") {
    const r = calculateSimilarTimeframe(pStart, pEnd);
    return toYmdRange(r.comparison.startDate, r.comparison.endDate);
  }

  if (baseline === "previous_year") {
    const r = calculateYearOverYear(pStart, pEnd);
    return toYmdRange(r.comparison.startDate, r.comparison.endDate);
  }

  if (baseline === "previous_year_match_dow") {
    const yoy = calculateYearOverYear(pStart, pEnd);
    const compareEnd = addDays(pStart, -7);
    compareEnd.setFullYear(compareEnd.getFullYear() - 1);
    const compareStart = addDays(compareEnd, -(length - 1));
    return toYmdRange(compareStart, compareEnd);
  }

  const r = calculateSimilarTimeframe(pStart, pEnd);
  return toYmdRange(r.comparison.startDate, r.comparison.endDate);
}

export function buildGa4ReportingRanges(input: {
  primaryPreset: Ga4PrimaryPresetId;
  primaryCustom: { startDate: string; endDate: string };
  compareEnabled: boolean;
  compareBaseline: Ga4CompareBaselineId;
  compareCustom: { startDate: string; endDate: string };
  reference?: Date;
}): ReportingCompareRanges {
  const ref = input.reference ?? new Date();
  const primary =
    input.primaryPreset === "custom"
      ? input.primaryCustom
      : computeGa4PrimaryRange(input.primaryPreset, ref);

  const pEnd = parseYmdLocal(primary.endDate);
  if (pEnd) {
    const capped = capEndAtReference(pEnd, ref);
    if (capped.getTime() !== pEnd.getTime()) {
      primary.endDate = formatDateForAPI(capped);
    }
  }

  if (!input.compareEnabled) {
    return { primary, compare: { ...primary } };
  }

  const compare =
    input.compareBaseline === "custom"
      ? input.compareCustom
      : computeGa4CompareRange(primary, input.compareBaseline);

  return { primary, compare };
}

export function formatGa4RangeLine(startDate: string, endDate: string): string {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (!start || !end) return "Select dates";
  if (startDate === endDate) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (start.getFullYear() === end.getFullYear()) {
    const sm = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const em = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${sm} - ${em}`;
  }
  const a = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const b = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${a} - ${b}`;
}

export function formatGa4RangeCompact(startDate: string, endDate: string): string {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (!start || !end) return "Dates";
  if (startDate === endDate) {
    return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  const sm = start.getMonth();
  const em = end.getMonth();
  if (sy === ey && sm === em) {
    const mon = start.toLocaleDateString("en-US", { month: "short" });
    return `${mon} ${start.getDate()}-${end.getDate()}, ${sy}`;
  }
  if (sy === ey) {
    const a = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const b = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${a}-${b}, ${sy}`;
  }
  const a = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const b = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${a}-${b}`;
}

const GA4_PRESET_TRIGGER_SHORT: Partial<Record<Ga4PrimaryPresetId, string>> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7: "Last 7d",
  last_28: "Last 28d",
  last_30: "Last 30d",
  last_month: "Last month",
  last_3_months: "Last 3 mo",
  last_6_months: "Last 6 mo",
  last_12_months: "Last 12 mo",
  this_month: "This month",
  this_week_sun: "This week",
  this_week_mon: "This week (Mon)",
  last_week_sun_sat: "Last week",
  last_week_mon_sat: "Last week (Mon)",
};

/** Single-line toolbar label (compact). */
export function formatGa4DatePickerTriggerCompact(
  preset: Ga4PrimaryPresetId,
  primary: { startDate: string; endDate: string },
  compareEnabled: boolean,
  compare: { startDate: string; endDate: string },
): string {
  const primaryPart =
    preset === "custom"
      ? formatGa4RangeCompact(primary.startDate, primary.endDate)
      : (GA4_PRESET_TRIGGER_SHORT[preset] ?? formatGa4RangeCompact(primary.startDate, primary.endDate));
  if (!compareEnabled) return primaryPart;
  const comparePart = formatGa4RangeCompact(compare.startDate, compare.endDate);
  return `${primaryPart} vs ${comparePart}`;
}

export function formatGa4DatePickerTriggerPrimary(
  preset: Ga4PrimaryPresetId,
  primary: { startDate: string; endDate: string },
): string {
  const range = formatGa4RangeLine(primary.startDate, primary.endDate);
  if (preset === "custom") return `Custom ${range}`;
  const label = GA4_PRIMARY_PRESET_OPTIONS.find((o) => o.id === preset)?.label;
  if (preset === "today" || preset === "yesterday") return label ?? range;
  return `${label ?? "Custom"} · ${range}`;
}

export function formatGa4DatePickerTriggerLabel(
  compareEnabled: boolean,
  primary: { startDate: string; endDate: string },
): string {
  const range = formatGa4RangeLine(primary.startDate, primary.endDate);
  return compareEnabled ? `${range} · Compare` : range;
}
