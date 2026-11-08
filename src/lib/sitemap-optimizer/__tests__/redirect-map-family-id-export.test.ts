import { describe, expect, it } from "vitest";
import { buildSitemapOptimizerAllRedirectCsvRedirectCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import { buildDeterministicGridBriefs } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { clusterRedirectMapForFamilies } from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import type { SitemapOptimizerPostRow, SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

function redirectRow(args: {
  id: string;
  oldUrl: string;
  newUrl: string;
}): SitemapOptimizerPostRow {
  return {
    postId: args.id,
    url: args.newUrl,
    gridRedirectFromUrl: args.oldUrl,
    collection: "posts",
    title: "Interest Q",
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
  };
}

describe("redirect map family_id export (WordPress + full inventory)", () => {
  it("includes family_id when only some inventory rows are from redirect CSV", () => {
    const redirectRows = [1, 2].map((q) =>
      redirectRow({
        id: `wp:q${q}`,
        oldUrl: `https://www.kwbllp.com/old/q${q}/`,
        newUrl: `https://www.kwbllp.com/blog/canadian-interest-rates-q${q}-2026/`,
      }),
    );
    const inventoryOnly: SitemapOptimizerPostRow = {
      postId: "wp:other",
      url: "https://www.kwbllp.com/blog/other-post/",
      collection: "posts",
      title: "Other",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    };

    const temporalExempt = {
      clusters: [
        {
          clusterId: "grid-temporal-1",
          label: "Rates",
          intent: "mixed" as const,
          memberPostIds: ["wp:q1", "wp:q2"],
          confidence: "high" as const,
          rationale: "",
          temporalPillarSlugStem: "canadian-interest-rates",
          temporalSectionHeaders: ["Q1", "Q2"],
        },
      ],
      exemptPostIds: new Set(["wp:q1", "wp:q2"]),
    };

    const { clusters, rows: clustered } = clusterRedirectMapForFamilies(
      redirectRows,
      1,
      temporalExempt,
    );
    const merges = buildDeterministicGridBriefs(clusters.clusters, clustered);
    const policies = applyGridOutputPolicies({
      rows: clustered,
      clusters,
      merges,
      gridMaxUrlsPerPost: 1,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    const result: SitemapOptimizerRunResult = {
      rows: [...policies.rows, inventoryOnly],
      clusters: policies.clusters,
      merges: policies.merges,
      contentSheet: policies.contentSheet,
      gscMissCount: 0,
      dateRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      analyzedAt: "2026-06-01T00:00:00.000Z",
      runMode: "wordpress",
      gridMaxUrlsPerPost: 1,
      redirectMapUpload: true,
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    };

    const { csv, rowCount } = buildSitemapOptimizerAllRedirectCsvRedirectCsv(result);
    expect(rowCount).toBe(2);
    expect(csv.split("\n")[0]).toContain("family_id");
    expect(csv).toContain("canadian-interest-rates-2026");
  });
});
