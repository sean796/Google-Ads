import { describe, expect, it } from "vitest";
import type { LocalDominatorRow } from "@/lib/local-dominator-csv";
import {
  buildCityLocationBucketsFromRows,
  buildGridLocationBucketsFromRows,
  cityBucketFromLocationLabel,
} from "@/lib/local-analysis/grid-location-buckets";

function gridRow(address: string, rank = 10): LocalDominatorRow {
  return {
    scanDate: "2026-01-01",
    latitude: 53.5,
    longitude: -113.5,
    rank,
    address,
    keyword: "test",
    business: "Test Business",
    placeId: "place-1",
    websiteUrl: "https://example.com",
    scanSize: "5x5",
    distance: 1,
    distanceMeasure: "mi",
    primaryCategory: "Store",
    secondaryCategories: "",
  };
}

describe("buildCityLocationBucketsFromRows", () => {
  it("groups by City, ST instead of street corridors", () => {
    const rows = [
      gridRow("100 63 Ave NW, Edmonton, AB", 8),
      gridRow("200 63 Ave NW, Edmonton, AB", 12),
      gridRow("10 Whyte Ave NW, Edmonton, AB", 15),
    ];
    const buckets = buildCityLocationBucketsFromRows(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.placeLabel).toBe("Edmonton, AB");
    expect(buckets[0]!.rowCount).toBe(3);
    expect(buckets[0]!.sampleAddresses.some((a) => a.includes("63 Ave"))).toBe(true);
  });
});

describe("cityBucketFromLocationLabel", () => {
  it("builds one city bucket from a profile location label", () => {
    const bucket = cityBucketFromLocationLabel(
      "Calgary, AB",
      "100 8 Ave SW, Calgary, AB T2P 1B2",
    );
    expect(bucket.bucketId).toBe("profile-city");
    expect(bucket.placeLabel).toBe("Calgary, AB");
    expect(bucket.sampleAddresses).toEqual([
      "100 8 Ave SW, Calgary, AB T2P 1B2",
      "Calgary, AB",
    ]);
    expect(bucket.rowCount).toBe(1);
  });

  it("uses the label as the only sample when no street address is set", () => {
    const bucket = cityBucketFromLocationLabel("Edmonton, AB");
    expect(bucket.sampleAddresses).toEqual(["Edmonton, AB"]);
  });
});

describe("buildGridLocationBucketsFromRows", () => {
  it("still splits street corridors when neighbourhood focus is off", () => {
    const rows = [
      gridRow("100 63 Ave NW, Edmonton, AB", 8),
      gridRow("10 Whyte Ave NW, Edmonton, AB", 15),
    ];
    const buckets = buildGridLocationBucketsFromRows(rows);
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    expect(buckets.some((b) => b.placeLabel.includes("63 Ave"))).toBe(true);
    expect(buckets.some((b) => b.placeLabel.includes("Whyte Ave"))).toBe(true);
  });
});
