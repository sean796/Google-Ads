import { describe, expect, it } from "vitest";
import {
  buildBenchmarkGridRagBlock,
  buildBenchmarkSemrushStub,
  buildBenchmarkTiersStub,
  filterBulkSheetToGridFootprint,
  gscContentKindsForBulkCurate,
  gscPlanContentKindsForBulkCurate,
  hasBenchmarkGridContext,
  sapRowsToBenchmarkEntityBulkRows,
  textMatchesBenchmarkGridPlaces,
} from "../vertical-benchmark-grid-entity";
import type { BenchmarkGridCsvContext } from "../vertical-benchmark-grid-entity";

const mockGridContext = {
  ok: true as const,
  gridSummaryMarkdown: "## Grid",
  placeHints: ["Sherwood Park, AB"],
  gridKeywordWeights: [{ keyword: "blinds", weight: 10 }],
  placeWeaknessWeights: [],
  gridRowsForDirectSap: [
    {
      scanDate: "2026-01-01",
      keyword: "blinds",
      rank: 12,
      business: "Example Blinds",
      address: "Sherwood Park, Alberta, Canada",
      placeId: "place-1",
      websiteUrl: "https://example.com",
      scanSize: "5x5",
      distance: 1,
      distanceMeasure: "mi",
      primaryCategory: "Window treatment store",
      secondaryCategories: "",
      latitude: 53.5,
      longitude: -113.2,
    },
  ],
  dominantKeyword: "blinds",
  wasCapped: false,
  originalCount: 1,
  loadedRowCount: 1,
  parsedRowCount: 1,
  matchedRowCount: 1,
  addressFilterApplied: false,
} satisfies BenchmarkGridCsvContext;

describe("hasBenchmarkGridContext", () => {
  it("is true when grid parsed", () => {
    expect(hasBenchmarkGridContext(mockGridContext)).toBe(true);
    expect(hasBenchmarkGridContext(null)).toBe(false);
  });
});

describe("gscContentKindsForBulkCurate", () => {
  it("always keeps toolbar content kinds (grid augments prompts only)", () => {
    expect(gscContentKindsForBulkCurate(["post", "entity"], mockGridContext)).toEqual([
      "post",
      "entity",
    ]);
    expect(gscContentKindsForBulkCurate(["entity"], mockGridContext)).toEqual(["entity"]);
  });
});

describe("gscPlanContentKindsForBulkCurate", () => {
  it("drops entity from GSC plans when grid is loaded", () => {
    expect(gscPlanContentKindsForBulkCurate(["post", "entity"], mockGridContext)).toEqual(["post"]);
    expect(gscPlanContentKindsForBulkCurate(["entity"], mockGridContext)).toEqual([]);
  });

  it("unchanged without grid", () => {
    expect(gscPlanContentKindsForBulkCurate(["post", "entity"], null)).toEqual(["post", "entity"]);
  });
});

const azGridContext = {
  ...mockGridContext,
  placeHints: ["Surprise, AZ", "Goodyear, AZ"],
  placeWeaknessWeights: [{ place: "Peoria, AZ", weight: 8 }],
} satisfies BenchmarkGridCsvContext;

describe("filterBulkSheetToGridFootprint", () => {
  it("keeps posts and drops off-grid entity rows", () => {
    const rows = [
      {
        contentKind: "post" as const,
        title: "Best Blinds Guide",
        entity: "",
        keyword: "blinds",
      },
      {
        contentKind: "entity" as const,
        title: "Blinds in Surprise",
        entity: "Surprise, AZ",
        keyword: "blinds surprise",
      },
      {
        contentKind: "entity" as const,
        title: "Edmonton Blinds: Expert Installation",
        entity: "Edmonton, AB",
        keyword: "blinds edmonton",
      },
      {
        contentKind: "entity" as const,
        title: "Sherwood Park Blinds",
        entity: "Sherwood Park, AB",
        keyword: "blinds",
      },
    ];
    const { kept, dropped } = filterBulkSheetToGridFootprint(rows, azGridContext);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(2);
    expect(dropped.map((r) => r.title)).toEqual(
      expect.arrayContaining([
        "Edmonton Blinds: Expert Installation",
        "Sherwood Park Blinds",
      ]),
    );
    expect(textMatchesBenchmarkGridPlaces("Blinds in Peoria", azGridContext)).toBe(true);
  });
});

describe("buildBenchmarkGridRagBlock", () => {
  it("includes grid summary and hints", () => {
    const block = buildBenchmarkGridRagBlock(mockGridContext);
    expect(block).toMatch(/LOCAL_DOMINATOR_GRID/i);
    expect(block).toMatch(/Sherwood Park/i);
    expect(block).toContain("## Grid");
  });
});

describe("sapRowsToBenchmarkEntityBulkRows", () => {
  it("maps google-maps modifier to service and fills entity column", () => {
    const rows = sapRowsToBenchmarkEntityBulkRows(
      [
        {
          keyword: "blinds",
          entity: "Sherwood Park, Edmonton",
          title: "Blinds Near Me in Sherwood Park, Edmonton",
          modifier: "google-maps",
          featuredImage: "google-maps",
        },
      ],
      "Blinds West",
      ["Hunter Douglas"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].modifier).toBe("service");
    expect(rows[0].featuredImage).toBe("y");
    expect(rows[0].entity).toBe("Sherwood Park, Edmonton");
    expect(rows[0].contentKind).toBe("entity");
    expect(rows[0].clientName).toBe("Blinds West");
    expect(rows[0].gscClicks).toBe(0);
  });
});

describe("benchmark semrush stub", () => {
  it("uses client hostname as seed domain", () => {
    const semrush = buildBenchmarkSemrushStub("https://blindmagic.com");
    expect(semrush.seedDomain).toBe("blindmagic.com");
    const tiers = buildBenchmarkTiersStub(semrush.seedDomain);
    expect(tiers.tiers[0]?.competitors[0]?.domain).toBe("blindmagic.com");
  });
});
