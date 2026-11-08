import { describe, expect, it } from "vitest";
import {
  applyContentYearPolicy,
  editorialDestinationWithContentYear,
} from "@/lib/sitemap-optimizer/apply-content-year-policy";
import { buildRedirectMapFamilyRows } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { normalizeMergeDestinations } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { refreshYearsInUrl } from "@/lib/sitemap-optimizer/grid-title-year";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

describe("editorialDestinationWithContentYear", () => {
  it("rolls slug years forward for budget destinations", () => {
    expect(
      refreshYearsInUrl("https://www.kwbllp.com/blog/canada-2023-budget/", 2026),
    ).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
    expect(
      editorialDestinationWithContentYear(
        "https://www.kwbllp.com/blog/canada-2023-budget/",
        2026,
      ),
    ).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
  });
});

describe("normalizeMergeDestinations with content year", () => {
  it("updates locked CSV slug years while preserving path structure", () => {
    const [merged] = normalizeMergeDestinations(
      [
        {
          clusterId: "c1",
          recommendedTitle: "Canada 2023 Budget Guide",
          recommendedPrimaryKeyword: "canada 2023 budget",
          recommendedMeta: "Meta",
          combinedOutline: [],
          whatToKeepFromEach: [],
          redirectOrCanonicalNote: "",
          priority: "high",
          confidence: "high",
          rationale: "",
          lockedDestinationUrl: "https://www.kwbllp.com/blog/canada-2023-budget/",
        },
      ],
      {
        forceBlogPermalink: true,
        parentPrefix: "blog",
        preserveCsvDestinations: true,
      },
      new Map([["c1", ["https://www.kwbllp.com/blog/canada-2023-budget/"]]]),
      "2026-06-01T00:00:00.000Z",
    );
    expect(merged?.lockedDestinationUrl).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
    expect(merged?.recommendedTitle).toBe("Canada 2023 Budget Guide");
  });
});

describe("redirect export destination years", () => {
  it("uses 2026 destinations in NEO Pulse redirect redirect rows", () => {
    const dest2023 = "https://www.kwbllp.com/blog/canada-2023-budget/";
    const row: SitemapOptimizerPostRow = {
      postId: "wp:1",
      url: dest2023,
      gridRedirectFromUrl: "https://www.kwbllp.com/2013/03/21/canada-2013-budget/",
      collection: "posts",
      title: "Canada 2013 Budget",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    };
    const result = {
      rows: [row],
      clusters: {
        clusters: [
          {
            clusterId: "c1",
            label: "Canada budget",
            intent: "informational" as const,
            memberPostIds: ["wp:1"],
            confidence: "high" as const,
            rationale: "",
          },
        ],
        singletons: [],
      },
      merges: [
        {
          clusterId: "c1",
          recommendedTitle: "Canada 2026 Budget Guide",
          recommendedPrimaryKeyword: "canada 2026 budget",
          recommendedMeta: "Meta",
          combinedOutline: [],
          whatToKeepFromEach: [],
          redirectOrCanonicalNote: "",
          priority: "high" as const,
          confidence: "high" as const,
          rationale: "",
          lockedDestinationUrl: dest2023,
        },
      ],
      contentSheet: [],
      gscMissCount: 0,
      dateRange: { startDate: "", endDate: "" },
      analyzedAt: "2026-06-01T00:00:00.000Z",
      runMode: "wordpress" as const,
      gridMaxUrlsPerPost: 1 as const,
      blogDestination: {
        forceBlogPermalink: true,
        parentPrefix: "blog",
        preserveCsvDestinations: true,
      },
    };
    const familyRows = buildRedirectMapFamilyRows(result);
    expect(familyRows[0]?.destinationUrl).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
    expect(familyRows[0]?.destination).toContain("canada-2026-budget");
  });
});

describe("applyContentYearPolicy", () => {
  it("updates content sheet newUrl and titles to analyzed year", () => {
    const dest2023 = "https://www.kwbllp.com/blog/canada-2023-budget/";
    const row: SitemapOptimizerPostRow = {
      postId: "wp:1",
      url: dest2023,
      gridRedirectFromUrl: "https://www.kwbllp.com/2013/03/21/canada-2013-budget/",
      collection: "posts",
      title: "Canada 2013 Budget",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    };
    const applied = applyContentYearPolicy({
      rows: [row],
      merges: [],
      contentSheet: [
        {
          postId: "wp:1",
          sourceUrl: dest2023,
          proposedDestinationUrl: dest2023,
          sourceTitle: "Canada 2023 Budget",
          action: "new_blog",
          priority: "medium",
          proposedTitle: "Canada 2023 Budget Guide",
          proposedPrimaryKeyword: "canada 2023 budget",
          proposedMeta: "Canada 2023 budget overview for taxpayers.",
        },
      ],
      clusters: {
        clusters: [
          {
            clusterId: "c1",
            label: "Canada budget",
            intent: "informational",
            memberPostIds: ["wp:1"],
            confidence: "high",
            rationale: "",
          },
        ],
        singletons: [],
      },
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(applied.rows[0]?.url).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
    expect(applied.contentSheet[0]?.sourceUrl).toBe("https://www.kwbllp.com/blog/canada-2026-budget/");
    expect(applied.contentSheet[0]?.proposedTitle).toContain("2026");
    expect(applied.contentSheet[0]?.proposedPrimaryKeyword).toContain("2026");
  });
});
