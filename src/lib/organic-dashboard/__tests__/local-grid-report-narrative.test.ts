import { describe, expect, it } from "vitest";
import { buildLocalGridResultsNarrativeParagraph } from "@/lib/organic-dashboard/local-grid-report-narrative";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";

const baseSummary = {
  totalPoints: 25,
  rankedPoints: 20,
  avgRank: 8.2,
  tarp: 11.4,
  highCount: 4,
  medCount: 6,
  lowCount: 5,
  outCount: 10,
  highPct: 16,
  medPct: 24,
  lowPct: 20,
  outPct: 40,
};

describe("buildLocalGridResultsNarrativeParagraph", () => {
  it("mentions keyword, TARP, and bucket percentages", () => {
    const snapshot: LocalGridReportingSnapshot = {
      scanId: "scan-1",
      keyword: "window shades stuart",
      scanDateLabel: "Oct 1, 2026",
      scanSize: "5x5",
      shape: "circle",
      distance: 1,
      distanceMeasure: "mile",
      summary: baseSummary,
    };
    const text = buildLocalGridResultsNarrativeParagraph(snapshot, "In the Shade");
    expect(text).toContain("window shades stuart");
    expect(text).toContain("11.4");
    expect(text).toContain("16%");
    expect(text).toContain("40%");
  });
});
