import { describe, expect, it } from "vitest";
import { buildSitemapOptimizerAllRedirectCsvRedirectCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

describe("buildSitemapOptimizerAllRedirectCsvRedirectCsv", () => {
  it("exports redirects for every merge member when content sheet has one row per cluster", () => {
    const legacyA =
      "https://www.kwbllp.com/2024/10/02/profit-improvement-strategies-for-auto-repair-businesses/";
    const legacyB =
      "https://www.kwbllp.com/2024/10/02/profit-improvement-strategies-for-construction-and-trades-businesses/";
    const dest = "https://www.kwbllp.com/blog/profit-improvement-strategies/";

    const result = {
      runMode: "wordpress" as const,
      rows: [
        {
          postId: "1",
          url: legacyA,
          collection: "posts",
          title: "Auto",
          keyword: "",
          meta: "",
          contentSnippet: "",
          gscQueries: [],
          gscFetched: true,
        },
        {
          postId: "2",
          url: legacyB,
          collection: "posts",
          title: "Construction",
          keyword: "",
          meta: "",
          contentSnippet: "",
          gscQueries: [],
          gscFetched: true,
        },
      ],
      clusters: {
        clusters: [
          {
            clusterId: "c1",
            label: "Profit",
            intent: "merge",
            memberPostIds: ["1", "2"],
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
          lockedDestinationUrl: dest,
        },
      ],
      contentSheet: [
        {
          postId: "1",
          sourceUrl: dest,
          legacySourceUrl: legacyA,
          sourceTitle: "Profit",
          action: "merge",
          priority: "high",
          proposedTitle: "Profit Improvement Strategies",
          proposedPrimaryKeyword: "profit improvement strategies",
          proposedMeta: "Meta",
          proposedDestinationUrl: dest,
          mergeClusterId: "c1",
          mergeSourceCount: 2,
        },
      ],
      gscMissCount: 0,
      dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      analyzedAt: "",
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    } satisfies SitemapOptimizerRunResult;

    const { csv, rowCount } = buildSitemapOptimizerAllRedirectCsvRedirectCsv(result);
    expect(rowCount).toBe(2);
    expect(csv).toContain("source");
    expect(csv).toContain("blog/profit-improvement-strategies");
    expect(csv).toContain("2024/10/02/profit-improvement-strategies-for-auto-repair");
    expect(csv).toContain("2024/10/02/profit-improvement-strategies-for-construction");
  });
});
