import { describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { parseLocalDominatorCsv } from "@/lib/local-dominator-csv";
import { runLocalGridExportForSite } from "@/lib/local-grid-studio/run-local-grid-export-for-site";

vi.mock("@/lib/local-grid-studio/local-grid-api", () => ({
  resolveLocalGridBusinessViaDfs: vi.fn(async () => ({
    business: {
      business: "Demo Blinds",
      address: "1 Main St",
      placeId: "pid",
      websiteUrl: "https://demo.example",
      primaryCategory: "Blinds",
      secondaryCategories: "",
      rating: 4.5,
      reviews: 10,
      latitude: 49.1,
      longitude: -97.1,
    },
    candidates: [],
    suggestedKeyword: "blinds near me",
  })),
  geocodeLocalGridAddress: vi.fn(),
  executeLocalGridScanWithProgress: vi.fn(async () => [
    {
      pointId: "pin_0",
      row: 0,
      col: 0,
      latitude: 49.1,
      longitude: -97.1,
      distanceFromCenter: 0,
      items: [
        {
          rank: 1,
          business: "Demo Blinds",
          address: "1 Main St",
          placeId: "pid",
          cid: "",
          websiteUrl: "https://demo.example",
          primaryCategory: "Blinds",
          secondaryCategories: "",
          rating: 4.5,
          reviews: 10,
          googleUrl: "https://maps.google.com",
        },
      ],
      error: null,
    },
  ]),
}));

describe("runLocalGridExportForSite", () => {
  const site: WordPressSite = {
    id: "wp-1",
    name: "Demo Blinds",
    siteUrl: "https://demo.example",
    username: "admin",
    appPassword: "secret",
    connectedAt: 1,
    primaryLocalKeyword: "blinds near me",
  };

  it("produces LD-compatible CSV", async () => {
    const result = await runLocalGridExportForSite(site, {
      keyword: "blinds near me",
      scanSize: "1x1",
    });
    expect(result.csvContent).toContain("Keyword");
    const parsed = parseLocalDominatorCsv(result.csvContent, { defaultKeyword: "blinds near me" });
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(result.effectiveKeyword).toBe("blinds near me");
  });
});
