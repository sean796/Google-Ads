import { describe, expect, it } from "vitest";
import {
  buildGa4ReportingRanges,
  computeGa4CompareRange,
  computeGa4PrimaryRange,
  formatGa4DatePickerTriggerCompact,
} from "@/lib/reporting/ga4-analytics-date-ranges";

const REF = new Date(2026, 3, 13); // Apr 13 2026 (Mon)

describe("computeGa4PrimaryRange", () => {
  it("last 7 days includes reference day", () => {
    const r = computeGa4PrimaryRange("last_7", REF);
    expect(r.endDate).toBe("2026-04-13");
    expect(r.startDate).toBe("2026-04-07");
  });

  it("last week Sun–Sat before reference week", () => {
    const r = computeGa4PrimaryRange("last_week_sun_sat", REF);
    expect(r.startDate).toBe("2026-04-05");
    expect(r.endDate).toBe("2026-04-11");
  });

  it("this month starts on first of month", () => {
    const r = computeGa4PrimaryRange("this_month", REF);
    expect(r.startDate).toBe("2026-04-01");
    expect(r.endDate).toBe("2026-04-13");
  });

  it("last month is the full previous calendar month", () => {
    const r = computeGa4PrimaryRange("last_month", REF);
    expect(r.startDate).toBe("2026-03-01");
    expect(r.endDate).toBe("2026-03-31");
  });

  it("last 60 days includes reference day", () => {
    const r = computeGa4PrimaryRange("last_60", REF);
    expect(r.endDate).toBe("2026-04-13");
    expect(r.startDate).toBe("2026-02-13");
  });

  it("last 90 days includes reference day", () => {
    const r = computeGa4PrimaryRange("last_90", REF);
    expect(r.endDate).toBe("2026-04-13");
    expect(r.startDate).toBe("2026-01-14");
  });

  it("last 3 months is three full calendar months before the current month", () => {
    const r = computeGa4PrimaryRange("last_3_months", REF);
    expect(r.startDate).toBe("2026-01-01");
    expect(r.endDate).toBe("2026-03-31");
  });

  it("last 6 months is six full calendar months before the current month", () => {
    const r = computeGa4PrimaryRange("last_6_months", REF);
    expect(r.startDate).toBe("2025-10-01");
    expect(r.endDate).toBe("2026-03-31");
  });

  it("last 12 months is twelve full calendar months before the current month", () => {
    const r = computeGa4PrimaryRange("last_12_months", REF);
    expect(r.startDate).toBe("2025-04-01");
    expect(r.endDate).toBe("2026-03-31");
  });

  it("this week Mon starts on Monday of reference week", () => {
    const r = computeGa4PrimaryRange("this_week_mon", REF);
    expect(r.endDate).toBe("2026-04-13");
    expect(r.startDate).toBe("2026-04-13");
  });
});

describe("computeGa4CompareRange", () => {
  it("previous period is immediately preceding equal length", () => {
    const primary = { startDate: "2026-04-01", endDate: "2026-04-13" };
    const c = computeGa4CompareRange(primary, "previous_period");
    expect(c.endDate).toBe("2026-03-31");
    expect(c.startDate).toBe("2026-03-19");
  });

  it("previous period match DOW ends on same weekday as primary start", () => {
    const primary = { startDate: "2026-04-01", endDate: "2026-04-13" };
    const c = computeGa4CompareRange(primary, "previous_period_match_dow");
    const end = new Date(c.endDate + "T12:00:00");
    const pStart = new Date(primary.startDate + "T12:00:00");
    expect(end.getDay()).toBe(pStart.getDay());
    expect(c.endDate).toBe("2026-03-25");
  });
});

describe("formatGa4DatePickerTriggerCompact", () => {
  it("single line custom compare shorthand", () => {
    const label = formatGa4DatePickerTriggerCompact(
      "custom",
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      true,
      { startDate: "2026-08-02", endDate: "2026-08-31" },
    );
    expect(label).toBe("Sep 1-30, 2026 vs Aug 2-31, 2026");
    expect(label.includes("\n")).toBe(false);
  });
});

describe("buildGa4ReportingRanges", () => {
  it("compare off mirrors primary on compare slot", () => {
    const r = buildGa4ReportingRanges({
      primaryPreset: "last_7",
      primaryCustom: { startDate: "", endDate: "" },
      compareEnabled: false,
      compareBaseline: "previous_period",
      compareCustom: { startDate: "", endDate: "" },
      reference: REF,
    });
    expect(r.primary.endDate).toBe("2026-04-13");
    expect(r.compare).toEqual(r.primary);
  });

  it("compare off last 6 months uses six full calendar months excluding the current month", () => {
    const ref = new Date(2026, 9, 19);
    const r = buildGa4ReportingRanges({
      primaryPreset: "last_6_months",
      primaryCustom: { startDate: "", endDate: "" },
      compareEnabled: false,
      compareBaseline: "previous_period",
      compareCustom: { startDate: "", endDate: "" },
      reference: ref,
    });
    expect(r.primary.startDate).toBe("2026-04-01");
    expect(r.primary.endDate).toBe("2026-09-30");
    expect(r.compare).toEqual(r.primary);
  });
});
