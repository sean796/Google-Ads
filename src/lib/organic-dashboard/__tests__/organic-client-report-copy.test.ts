import { describe, expect, it } from "vitest";
import {
  formatClientReportCoverMonthYear,
  formatClientReportPeriodLine,
  formatClientReportTopQueryMeta,
  normalizeClientReportText,
  sanitizeClientReportMetricValue,
} from "@/lib/organic-dashboard/organic-client-report-copy";


describe("organic-client-report-copy", () => {
  it("replaces em and en dashes in prose", () => {
    expect(normalizeClientReportText("Brand queries\u2014non-brand terms")).toBe(
      "Brand queries, non-brand terms",
    );
    expect(formatClientReportPeriodLine(true, "Aug 15\u2013Sep 13, 2026", "Sep 14\u2013Oct 13, 2026")).toBe(
      "Aug 15-Sep 13, 2026 vs Sep 14-Oct 13, 2026",
    );
  });

  it("formats query lines without em dashes", () => {
    expect(formatClientReportTopQueryMeta("29")).toBe("29 clicks");
  });

  it("maps missing metric placeholder to n/a", () => {
    expect(sanitizeClientReportMetricValue("\u2014")).toBe("n/a");
  });

  it("extracts cover month and year cleanly", () => {
    expect(formatClientReportCoverMonthYear("October 1-27, 2026")).toBe("OCTOBER 2026");
    expect(formatClientReportCoverMonthYear("September 4-30, 2026 vs October 1-27, 2026")).toBe("OCTOBER 2026");
    expect(formatClientReportCoverMonthYear("June 2021")).toBe("JUNE 2021");
  });
});

