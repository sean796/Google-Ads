import { describe, expect, it } from "vitest";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildDeterministicGridBrief } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import {
  ensureKeywordYearsInTitle,
  getGridContentYear,
  refreshContentSheetRowTitles,
  refreshYearsInText,
  refreshYearsInUrl,
  shouldRefreshYearsForCluster,
} from "@/lib/sitemap-optimizer/grid-title-year";
import { applyCompanyNewsTags } from "@/lib/sitemap-optimizer/grid-company-news";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerContentSheetRow,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

describe("ensureKeywordYearsInTitle", () => {
  it("prepends year from keyword when AI omits it from title", () => {
    expect(
      ensureKeywordYearsInTitle(
        "2026 federal budget changes",
        "Federal Budget Changes: A Historical Overview",
      ),
    ).toBe("2026 Federal Budget Changes: A Historical Overview");
  });
});

describe("refreshYearsInText", () => {
  it("bumps standalone 4-digit years to the target year", () => {
    expect(refreshYearsInText("Alberta Budget 2024", 2026)).toBe("Alberta Budget 2026");
    expect(refreshYearsInText("Tax tips for 2019 and 2020 filers", 2026)).toBe(
      "Tax tips for 2026 and 2026 filers",
    );
  });
});

describe("refreshYearsInUrl", () => {
  it("updates years in blog slug paths", () => {
    expect(refreshYearsInUrl("https://www.kwbllp.com/blog/alberta-budget-2024/", 2026)).toBe(
      "https://www.kwbllp.com/blog/alberta-budget-2026/",
    );
    expect(refreshYearsInUrl("https://www.kwbllp.com/blog/canada-2023-budget/", 2026)).toBe(
      "https://www.kwbllp.com/blog/canada-2026-budget/",
    );
    expect(refreshYearsInUrl("https://www.kwbllp.com/blog/2013-federal-budget-changes/", 2026)).toBe(
      "https://www.kwbllp.com/blog/2026-federal-budget-changes/",
    );
  });
});

describe("getGridContentYear", () => {
  it("uses analyzedAt when provided", () => {
    expect(getGridContentYear("2025-06-01T12:00:00.000Z")).toBe(2025);
  });
});

describe("shouldRefreshYearsForCluster", () => {
  it("skips refresh when any member is company news", () => {
    const tax = { title: "Alberta Budget 2024" } as SitemapOptimizerPostRow;
    const company = applyCompanyNewsTags([
      { title: "Welcome New Partner 2019" } as SitemapOptimizerPostRow,
    ])[0]!;
    expect(shouldRefreshYearsForCluster([tax])).toBe(true);
    expect(shouldRefreshYearsForCluster([company])).toBe(false);
    expect(shouldRefreshYearsForCluster([tax, company])).toBe(false);
  });
});

describe("refreshContentSheetRowTitles", () => {
  it("leaves years on company clusters", () => {
    const members = applyCompanyNewsTags([
      { title: "Welcome New Partner 2019" } as SitemapOptimizerPostRow,
    ]);
    const sheet: SitemapOptimizerContentSheetRow = {
      postId: "wp:1",
      sourceUrl: "https://example.com/new/",
      sourceTitle: "Welcome New Partner 2019",
      action: "keep",
      priority: "medium",
      proposedTitle: "Welcome New Partner 2019",
      proposedPrimaryKeyword: "kwb partner 2019",
      proposedMeta: "Celebrating our 2019 partner.",
      rationale: "Firm news",
    };
    const out = refreshContentSheetRowTitles(sheet, members, 2026);
    expect(out.proposedTitle).toBe("Welcome New Partner 2019");
  });
});

describe("applyGridOutputPolicies", () => {
  const dest = "https://www.kwbllp.com/blog/alberta-budget-2026/";

  function taxRow(): SitemapOptimizerPostRow {
    return {
      postId: "csv:1",
      url: dest,
      gridRedirectFromUrl: "https://www.kwbllp.com/blog/alberta-budget-2024/",
      collection: "grid_csv",
      title: "Alberta Budget 2024",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
      gridTopicTag: "alberta_budget",
      uploadRowIndex: 1,
    };
  }

  it("updates content sheet proposedTitle to current year for tax clusters", () => {
    const rows = [taxRow()];
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "grid-group-1",
          label: "Alberta Budget",
          intent: "informational",
          memberPostIds: ["csv:1"],
          confidence: "high",
          rationale: "test",
        },
      ],
      singletons: [],
    };
    const rowMap = new Map(rows.map((r) => [r.postId, r]));
    const brief = buildDeterministicGridBrief(clusters.clusters[0]!, rowMap)!;
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        ...brief,
        recommendedTitle: "Alberta Budget 2024",
        recommendedPrimaryKeyword: "alberta budget 2024",
        recommendedMeta: "Alberta Budget 2024 highlights for businesses.",
      },
    ];

    const { rows: outRows, contentSheet, clusters: outClusters } = applyGridOutputPolicies({
      rows,
      clusters,
      merges,
      gridMaxUrlsPerPost: 5,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(contentSheet[0]?.proposedTitle).toBe("Alberta Budget 2026");
    expect(contentSheet[0]?.proposedMeta).toContain("2026");
    expect(contentSheet[0]?.sourceUrl).toBe("https://www.kwbllp.com/blog/alberta-budget-2026/");
    expect(outRows[0]?.url).toBe("https://www.kwbllp.com/blog/alberta-budget-2026/");
    expect(outClusters.clusters).toHaveLength(1);
  });

  it("keeps per-row clusters while deduping content sheet by shared new_url in 1:1 redirect mode", () => {
    const dest = "https://www.kwbllp.com/blog/2026-canadian-alberta-tax-brackets/";
    const rows: SitemapOptimizerPostRow[] = [2024, 2025, 2026].map((y, i) => ({
      postId: `csv:${i}`,
      url: `https://www.kwbllp.com/blog/${y}-canadian-alberta-tax-brackets/`,
      gridRedirectFromUrl: `https://www.kwbllp.com/${y}/tax-brackets/`,
      gridRedirectGroup: i + 1,
      collection: "grid_csv",
      title: `${y} tax brackets`,
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
      uploadRowIndex: i + 1,
    }));

    const clusters = {
      clusters: rows.map((r, i) => ({
        clusterId: `grid-row-${i}`,
        label: r.title,
        intent: "informational" as const,
        memberPostIds: [r.postId],
        confidence: "high" as const,
        rationale: "per row",
      })),
      singletons: [],
    };
    const rowMap = new Map(rows.map((r) => [r.postId, r]));
    const merges = clusters.clusters.map((c) => ({
      ...buildDeterministicGridBrief(c, rowMap)!,
      recommendedTitle: `${c.label}: Rates Explained`,
    }));

    const { contentSheet, clusters: outClusters } = applyGridOutputPolicies({
      rows,
      clusters,
      merges,
      gridMaxUrlsPerPost: 1,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(outClusters.clusters).toHaveLength(3);
    expect(outClusters.clusters[0]?.memberPostIds).toHaveLength(1);
    expect(contentSheet).toHaveLength(1);
    expect(contentSheet[0]?.sourceUrl).toBe(dest);
    expect(contentSheet[0]?.proposedTitle).toContain("2026");
  });
});
