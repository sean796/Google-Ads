import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aggregateLocalGridScan,
  buildCanonicalBusinessKey,
  classifyPinBucket,
} from "../local-grid-aggregator";
import {
  LOCAL_DOMINATOR_CSV_HEADERS,
  parseLocalDominatorFullScanCsv,
  serializeLocalGridScanToCsv,
} from "../local-grid-csv";
import {
  computeGridBounds,
  generateLocalGridCoordinates,
  partitionReusableGridPoints,
} from "../local-grid-math";
import type { LocalGridPointResult } from "../local-grid-types";

describe("local-grid-math", () => {
  it("defaults to 1x1 single center pin for fast live verification", () => {
    const nodes = generateLocalGridCoordinates({
      centerLat: 49.1856,
      centerLng: -97.9352,
      scanSize: "1x1",
      shape: "circle",
      distance: 1,
      distanceMeasure: "mile",
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      pointId: "r0_c0",
      row: 0,
      col: 0,
      latitude: 49.1856,
      longitude: -97.9352,
      distanceFromCenter: 0,
    });
  });

  it("fits 15x15 circular grid bounds to the full ring, not center-only zoom", () => {
    const circleNodes = generateLocalGridCoordinates({
      centerLat: 53.551864,
      centerLng: -113.614238,
      scanSize: "15x15",
      shape: "circle",
      distance: 1,
      distanceMeasure: "mile",
    });
    const bounds = computeGridBounds(circleNodes);
    const span = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLng - bounds.minLng);
    expect(span).toBeGreaterThan(0.18);
    expect(bounds.recommendedZoom).toBeLessThanOrEqual(12);
  });

  it("generates 177 circular pins and 225 square pins for 15x15 grids", () => {
    const circleNodes = generateLocalGridCoordinates({
      centerLat: 49.1856,
      centerLng: -97.9352,
      scanSize: "15x15",
      shape: "circle",
      distance: 1,
      distanceMeasure: "mile",
    });
    const squareNodes = generateLocalGridCoordinates({
      centerLat: 49.1856,
      centerLng: -97.9352,
      scanSize: "15x15",
      shape: "square",
      distance: 1,
      distanceMeasure: "mile",
    });

    expect(circleNodes).toHaveLength(177);
    expect(squareNodes).toHaveLength(225);
  });

  it("reuses the verified 1x1 center pin when expanding to 3x3", () => {
    const centerPoint: LocalGridPointResult = {
      pointId: "r0_c0",
      row: 0,
      col: 0,
      latitude: 49.1856,
      longitude: -97.9352,
      distanceFromCenter: 0,
      items: [
        {
          rank: 1,
          business: "Advance Blinds & Drapery",
          address: "303A Main Ave, Plum Coulee, MB R0G 1R0",
          placeId: "12306432658930552311",
          cid: "12306432658930552311",
          websiteUrl: "www.advanceblindsanddrapery.com",
          primaryCategory: "Blinds shop",
          secondaryCategories: "Awning supplier, Curtain store",
          rating: 5,
          reviews: 17,
          googleUrl: "https://www.google.com/maps?cid=12306432658930552311",
        },
      ],
    };

    const nextNodes = generateLocalGridCoordinates({
      centerLat: 49.1856,
      centerLng: -97.9352,
      scanSize: "3x3",
      shape: "square",
      distance: 1,
      distanceMeasure: "mile",
    });

    const { reused, missing } = partitionReusableGridPoints(nextNodes, [centerPoint]);
    expect(reused).toHaveLength(1);
    expect(missing).toHaveLength(8);
  });
});

describe("local-grid-aggregator & CSV round-trip", () => {
  it("classifies pin buckets and computes Avg Rank, TARP, and competitor switching", () => {
    expect(classifyPinBucket(1)).toBe("rank1");
    expect(classifyPinBucket(3)).toBe("high");
    expect(classifyPinBucket(7)).toBe("med");
    expect(classifyPinBucket(15)).toBe("low");
    expect(classifyPinBucket(null)).toBe("out");

    const sampleCsv = [
      LOCAL_DOMINATOR_CSV_HEADERS.join(","),
      `"Oct 4, 2026 3:03 PM","49.1856","-97.9352","blinds near me","Advance Blinds & Drapery","303A Main Ave, Plum Coulee, MB R0G 1R0","12306432658930552311","www.advanceblindsanddrapery.com","1x1","1","mile","1","Blinds shop","Awning supplier, Curtain store","","5","17","https://www.google.com/maps?cid="`,
      `"Oct 4, 2026 3:03 PM","49.1856","-97.9352","blinds near me","Budget Blinds of Southeast Manitoba","195 Mountain St S, Morden, MB R6M 1R8","3518421273268698001","www.budgetblinds.com","1x1","1","mile","2","Blinds shop","","","4.9","45","https://www.google.com/maps?cid="`,
    ].join("\n");

    const parsed = parseLocalDominatorFullScanCsv(sampleCsv, {
      siteId: "site-1",
      preferredBusinessName: "Advance Blinds & Drapery",
    });
    expect(parsed.error).toBeUndefined();
    expect(parsed.scan).not.toBeNull();
    expect(parsed.scan!.points).toHaveLength(1);

    const view = aggregateLocalGridScan(parsed.scan!.points, parsed.scan!.targetBusiness);
    expect(view.summary.avgRank).toBe(1);
    expect(view.summary.highPct).toBe(100);
    expect(view.competitors).toHaveLength(2);

    const reserialized = serializeLocalGridScanToCsv(parsed.scan!);
    expect(reserialized.split("\n")[0]).toBe(LOCAL_DOMINATOR_CSV_HEADERS.join(","));
  });

  it("matches the reference Advance Blinds & Drapery 15x15 CSV metrics when file is present", () => {
    const csvPath = "C:\\Users\\Sean Craig\\Downloads\\blinds near me_10_20_2026.csv";
    if (!fs.existsSync(csvPath)) return;

    const raw = fs.readFileSync(csvPath, "utf8");
    const parsed = parseLocalDominatorFullScanCsv(raw, {
      siteId: "advance-blinds",
      preferredBusinessName: "Advance Blinds & Drapery",
      preferredWebsiteUrl: "www.advanceblindsanddrapery.com",
    });

    expect(parsed.scan).not.toBeNull();
    const doc = parsed.scan!;
    const target = {
      key: buildCanonicalBusinessKey({
        placeId: "12306432658930552311",
        cid: "12306432658930552311",
        business: "Advance Blinds & Drapery",
      }),
      business: "Advance Blinds & Drapery",
      address: "303A Main Ave, Plum Coulee, MB R0G 1R0",
      placeId: "12306432658930552311",
      cid: "12306432658930552311",
      websiteUrl: "www.advanceblindsanddrapery.com",
      primaryCategory: "Blinds shop",
      secondaryCategories: "Awning supplier, Curtain store",
      rating: 5,
      reviews: 17,
      latitude: null,
      longitude: null,
    };

    const view = aggregateLocalGridScan(doc.points, target);
    expect(view.summary.avgRank).toBeCloseTo(3.03, 1);
    expect(view.summary.highPct).toBe(77);
    expect(view.summary.medPct).toBe(18);
    expect(view.summary.lowPct).toBe(4);
    expect(view.summary.outPct).toBe(1);
    expect(view.competitors.length).toBeGreaterThanOrEqual(40);
  });

  it("formats human-friendly scan dates correctly", async () => {
    const { formatHumanFriendlyScanDate } = await import(
      "@/components/organic-dashboard/local-grid/use-local-grid-panel"
    );
    expect(formatHumanFriendlyScanDate(null)).toBe("No scans yet");
    expect(formatHumanFriendlyScanDate("")).toBe("No scans yet");
    expect(formatHumanFriendlyScanDate("—")).toBe("No scans yet");
    expect(formatHumanFriendlyScanDate("Oct 21, 2026")).toBe("Yesterday");
    expect(formatHumanFriendlyScanDate("Jan 15, 2025")).toBe("Jan 15, 2025");
  });
});
