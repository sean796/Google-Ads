import { describe, expect, it } from "vitest";
import {
  GA4_CALENDAR_HISTORY_MONTHS,
  ga4CalendarMonthCount,
  ga4CalendarMonthIndex,
  ga4CalendarSpan,
  ga4CalendarStartMonth,
} from "@/lib/reporting/ga4-calendar-month-span";

describe("ga4-calendar-month-span", () => {
  const ref = new Date(2026, 9, 11);

  it("spans 48 inclusive months through reference month", () => {
    const span = ga4CalendarSpan(ref);
    expect(span.monthCount).toBe(GA4_CALENDAR_HISTORY_MONTHS);
    expect(span.endMonth.getFullYear()).toBe(2026);
    expect(span.endMonth.getMonth()).toBe(9);
    expect(span.startMonth.getFullYear()).toBe(2022);
    expect(span.startMonth.getMonth()).toBe(10);
  });

  it("start month is 47 months before end month", () => {
    const start = ga4CalendarStartMonth(ref);
    const count = ga4CalendarMonthCount(start, new Date(2026, 9, 1));
    expect(count).toBe(48);
  });

  it("month index is 0 at list start and last at current month", () => {
    const span = ga4CalendarSpan(ref);
    expect(ga4CalendarMonthIndex(span.startMonth, span.startMonth)).toBe(0);
    expect(ga4CalendarMonthIndex(span.startMonth, span.endMonth)).toBe(47);
    expect(ga4CalendarMonthIndex(span.startMonth, ref)).toBe(47);
  });
});
