import { describe, expect, it } from "vitest";
import { formatOrganicDashboardMonthColumn } from "@/lib/organic-dashboard/organic-dashboard-month-column-label";

describe("formatOrganicDashboardMonthColumn", () => {
  it("formats YYYY-MM as abbreviated month without year", () => {
    expect(formatOrganicDashboardMonthColumn("2026-05")).toBe("May");
    expect(formatOrganicDashboardMonthColumn("2026-10")).toBe("Oct");
  });

  it("formats GA4-style labels without year", () => {
    expect(formatOrganicDashboardMonthColumn("Nov 2025")).toBe("Nov");
  });
});
