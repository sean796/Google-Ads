/** GA4-style scrollable picker: months from this floor through current month. */
export const GA4_CALENDAR_HISTORY_MONTHS = 48;

export function ga4CalendarEndMonth(reference: Date = new Date()): Date {
  const ref = new Date(reference.getFullYear(), reference.getMonth(), 1);
  return ref;
}

/** First month shown in the scroll list (48 months inclusive through current month). */
export function ga4CalendarStartMonth(reference: Date = new Date()): Date {
  const end = ga4CalendarEndMonth(reference);
  return new Date(end.getFullYear(), end.getMonth() - (GA4_CALENDAR_HISTORY_MONTHS - 1), 1);
}

export function ga4CalendarMonthCount(
  startMonth: Date,
  endMonth: Date,
): number {
  return (
    (endMonth.getFullYear() - startMonth.getFullYear()) * 12 +
    (endMonth.getMonth() - startMonth.getMonth()) +
    1
  );
}

export function ga4CalendarMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function ga4CalendarSpan(reference: Date = new Date()): {
  startMonth: Date;
  endMonth: Date;
  monthCount: number;
} {
  const endMonth = ga4CalendarEndMonth(reference);
  const startMonth = ga4CalendarStartMonth(reference);
  return {
    startMonth,
    endMonth,
    monthCount: ga4CalendarMonthCount(startMonth, endMonth),
  };
}

/** Zero-based index of `target` month within the scroll list that starts at `listStartMonth`. */
export function ga4CalendarMonthIndex(listStartMonth: Date, target: Date): number {
  const start = new Date(listStartMonth.getFullYear(), listStartMonth.getMonth(), 1);
  const t = new Date(target.getFullYear(), target.getMonth(), 1);
  return (t.getFullYear() - start.getFullYear()) * 12 + (t.getMonth() - start.getMonth());
}
