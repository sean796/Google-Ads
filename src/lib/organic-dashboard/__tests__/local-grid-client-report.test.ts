import { describe, expect, it } from "vitest";
import {
  buildLocalGridClientReportSection,
  buildLocalGridReportingSnapshot,
} from "@/lib/organic-dashboard/local-grid-client-report";
import type { LocalGridScanDocument } from "@/lib/local-grid-studio/local-grid-types";

function sampleScan(): LocalGridScanDocument {
  return {
    scanId: "scan-1",
    siteId: "site-1",
    scanDateIso: "2026-01-01T00:00:00.000Z",
    scanDateLabel: "Jan 1, 2026",
    keyword: "blinds edmonton",
    scanSize: "3x3",
    shape: "circle",
    distance: 1,
    distanceMeasure: "mile",
    centerLat: 53.5,
    centerLng: -113.5,
    targetBusiness: {
      key: "test",
      business: "Test Blinds",
      address: "123 Main",
      placeId: "pid-1",
      websiteUrl: "https://example.com",
      primaryCategory: "Blinds shop",
      secondaryCategories: "",
      rating: 4.5,
      reviews: 100,
      latitude: 53.5,
      longitude: -113.5,
    },
    points: [
      {
        pointId: "p0",
        row: 0,
        col: 0,
        latitude: 53.5,
        longitude: -113.5,
        distanceFromCenter: 0,
        items: [
          {
            rank: 1,
            business: "Test Blinds",
            address: "123 Main",
            placeId: "pid-1",
            websiteUrl: "https://example.com",
            primaryCategory: "Blinds shop",
            secondaryCategories: "",
            rating: 4.5,
            reviews: 100,
            googleUrl: "",
          },
        ],
      },
    ],
  };
}

describe("local-grid-client-report", () => {
  it("builds reporting snapshot and deck section from scan", () => {
    const scan = sampleScan();
    const snapshot = buildLocalGridReportingSnapshot(scan);
    expect(snapshot?.scanId).toBe("scan-1");
    expect(snapshot?.summary.totalPoints).toBe(1);

    const section = buildLocalGridClientReportSection(scan);
    expect(section?.meta.keyword).toBe("blinds edmonton");
    expect(section?.summaryRows.length).toBeGreaterThan(0);
    expect(section?.evaluatedPins).toHaveLength(1);
    expect(section?.previewNodes).toHaveLength(1);
    expect(section?.previewNodes[0]?.pointId).toBe("p0");
    expect(section?.meta.centerLat).toBe(53.5);
    expect(section?.meta.centerLng).toBe(-113.5);
  });

  it("returns null section when scan has no points", () => {
    const scan = { ...sampleScan(), points: [] };
    expect(buildLocalGridClientReportSection(scan)).toBeNull();
  });
});
