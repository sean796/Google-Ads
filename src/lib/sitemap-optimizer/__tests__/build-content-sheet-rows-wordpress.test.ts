import { describe, expect, it } from "vitest";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import { buildSitemapOptimizerContentSheetCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-export";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

const legacy = (slug: string) =>
  `https://www.kwbllp.com/2026/04/02/${slug}/`;

function post(id: string, slug: string): SitemapOptimizerPostRow {
  return {
    postId: id,
    url: legacy(slug),
    collection: "posts",
    title: `Title ${slug}`,
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
  };
}

describe("buildContentSheetRows wordpress", () => {
  it("emits one content plan per merge cluster with blog destination as primary URL", () => {
    const rows = [
      post("1", "auto-repair-tax"),
      post("2", "construction-tax"),
      post("3", "medical-tax"),
    ];
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "family-1",
          label: "Integrated tax planning",
          intent: "merge",
          confidence: "high",
          rationale: "",
          memberPostIds: ["1", "2", "3"],
        },
      ],
      singletons: [],
    };
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        clusterId: "family-1",
        recommendedTitle: "Integrated Tax Planning Guide",
        recommendedPrimaryKeyword: "tax planning",
        recommendedMeta: "Meta",
        combinedOutline: ["Overview"],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "high",
        confidence: "high",
        rationale: "One family",
        lockedDestinationUrl: "https://www.kwbllp.com/blog/integrated-tax-planning/",
      },
    ];

    const sheet = buildContentSheetRows({
      rows,
      clusters,
      merges,
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    });

    expect(sheet).toHaveLength(1);
    expect(sheet[0]?.mergeSourceCount).toBe(3);
    expect(sheet[0]?.sourceUrl).toBe("https://www.kwbllp.com/blog/integrated-tax-planning/");
    expect(sheet[0]?.sourceUrl).not.toContain("/2026/04/02/");
    expect(sheet[0]?.legacySourceUrl).toContain("/2026/04/02/");

    const csv = buildSitemapOptimizerContentSheetCsv({
      runMode: "wordpress",
      rows,
      clusters,
      merges,
      contentSheet: sheet,
      gscMissCount: 0,
      dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      analyzedAt: "",
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    });
    expect(csv.split(/\r?\n/)[0]).toContain("keyword");
    expect(csv).toContain("Integrated Tax Planning Guide");
    expect(csv).not.toContain("auto-repair-tax");
  });
});
