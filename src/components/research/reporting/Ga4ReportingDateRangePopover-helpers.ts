import type { Ga4PrimaryPresetId } from "@/lib/reporting/ga4-analytics-date-ranges";

export function ymdToDate(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export type WeekSubmenuId = "this_week" | "last_week" | null;

export type CalendarTarget = "primary" | "compare";

export function presetMatchesSidebarRow(
  preset: Ga4PrimaryPresetId,
  rowId: Ga4PrimaryPresetId,
): boolean {
  if (preset === rowId) return true;
  if (rowId === "this_week_sun") {
    return preset === "this_week_sun" || preset === "this_week_mon";
  }
  if (rowId === "last_week_sun_sat") {
    return preset === "last_week_sun_sat" || preset === "last_week_mon_sat";
  }
  return false;
}
