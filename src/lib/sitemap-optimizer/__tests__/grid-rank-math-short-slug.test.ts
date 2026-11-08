import { describe, expect, it } from "vitest";
import { buildGridRedirectCsvRedirectRows } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { GRID_DESTINATION_MAX_SLUG_CHARS } from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

function slugLen(url: string): number {
  const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  return seg.length;
}

describe("buildGridRedirectCsvRedirectRows short destinations", () => {
  it("uses shortened blog slug for shared family destination", () => {
    const dest =
      "https://www.kwbllp.com/blog/profit-improvement-strategies-for-auto-repair-businesses/";
    const result = {
      runMode: "grid_csv" as const,
      rows: [
        {
          postId: "csv:0",
          url: dest,
          gridRedirectFromUrl:
            "https://www.kwbllp.com/2024/10/02/profit-improvement-strategies-for-auto-repair-businesses/",
          collection: "grid_csv",
          title: "Auto repair",
          keyword: "",
          meta: "",
          contentSnippet: "",
          gscQueries: [],
          gscFetched: true,
          gridTopicTag: "profit_improvement",
        },
        {
          postId: "csv:1",
          url: dest,
          gridRedirectFromUrl:
            "https://www.kwbllp.com/2024/10/02/profit-improvement-strategies-for-construction-and-trades-businesses/",
          collection: "grid_csv",
          title: "Construction",
          keyword: "",
          meta: "",
          contentSnippet: "",
          gscQueries: [],
          gscFetched: true,
          gridTopicTag: "profit_improvement",
        },
      ],
      clusters: {
        clusters: [
          {
            clusterId: "c1",
            label: "Profit improvement",
            intent: "merge",
            memberPostIds: ["csv:0", "csv:1"],
            confidence: "high",
            rationale: "",
          },
        ],
        singletons: [],
      },
      merges: [
        {
          clusterId: "c1",
          recommendedTitle: "Profit Improvement Strategies",
          recommendedPrimaryKeyword: "profit improvement strategies",
          recommendedMeta: "Meta",
          combinedOutline: ["Overview"],
          whatToKeepFromEach: [],
          redirectOrCanonicalNote: "",
          priority: "high",
          confidence: "high",
          rationale: "",
          lockedDestinationUrl:
            "https://www.kwbllp.com/blog/profit-improvement-strategies/",
        },
      ],
      contentSheet: [],
      gscMissCount: 0,
      dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      analyzedAt: "",
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
      gridMaxUrlsPerPost: 5,
    } satisfies SitemapOptimizerRunResult;

    const rows = buildGridRedirectCsvRedirectRows(result);
    expect(rows.length).toBe(2);
    const destinations = new Set(rows.map((r) => r.destinationUrl));
    expect(destinations.size).toBe(1);
    const only = [...destinations][0]!;
    expect(slugLen(only)).toBeLessThanOrEqual(GRID_DESTINATION_MAX_SLUG_CHARS);
    expect(only).toBe("https://www.kwbllp.com/blog/profit-improvement-strategies/");
  });
});
