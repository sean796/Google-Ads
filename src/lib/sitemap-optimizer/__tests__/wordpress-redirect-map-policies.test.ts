import { describe, expect, it } from "vitest";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildDeterministicGridBriefs } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import { clusterRedirectMapForOneToOne } from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import {
  buildRedirectMapFamilyRedirectCsvCsv,
  buildRedirectMapFamilyRows,
  buildRedirectMapFamilyWideCsv,
} from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { buildSitemapOptimizerContentSheetCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-export";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function redirectRow(args: {
  id: string;
  oldUrl: string;
  newUrl: string;
  title?: string;
}): SitemapOptimizerPostRow {
  return {
    postId: args.id,
    url: args.newUrl,
    gridRedirectFromUrl: args.oldUrl,
    collection: "posts",
    title: args.title ?? "Topic",
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
  };
}

describe("wordpress redirect map output policies", () => {
  it("merges quarterly interest-rate URLs into one family with 2026 titles", () => {
    const rows = [1, 2, 3, 4].map((q) =>
      redirectRow({
        id: `wp:${q}`,
        oldUrl: `https://www.kwbllp.com/old/q${q}/`,
        newUrl: `https://www.kwbllp.com/blog/canadian-interest-rates-q${q}-2025/`,
        title: `Canadian Interest Rates Q${q} 2025`,
      }),
    );

    const { clusters: draftClusters, rows: clusteredRows } = clusterRedirectMapForOneToOne(rows);
    const draftMerges = buildDeterministicGridBriefs(draftClusters.clusters, clusteredRows);
    const policies = applyGridOutputPolicies({
      rows: clusteredRows,
      clusters: draftClusters,
      merges: draftMerges,
      gridMaxUrlsPerPost: 1,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(policies.clusters.clusters).toHaveLength(1);
    expect(policies.contentSheet).toHaveLength(1);
    expect(policies.contentSheet[0]?.proposedTitle).toContain("2026");
    expect(policies.contentSheet[0]?.mergeSourceCount).toBe(4);
  });

  it("redirect wide CSV shares family_tag for rows in the same family", () => {
    const rows = [
      redirectRow({
        id: "wp:1",
        oldUrl: "https://example.com/old/a/",
        newUrl: "https://example.com/blog/auto-repair-business/",
      }),
      redirectRow({
        id: "wp:2",
        oldUrl: "https://example.com/old/b/",
        newUrl: "https://example.com/blog/auto-repair-business/",
      }),
    ];
    const { clusters, rows: outRows } = clusterRedirectMapForOneToOne(rows);
    const merges = buildDeterministicGridBriefs(clusters.clusters, outRows);
    const policies = applyGridOutputPolicies({
      rows: outRows,
      clusters,
      merges,
      gridMaxUrlsPerPost: 1,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    const result = {
      rows: policies.rows,
      clusters: policies.clusters,
      merges: policies.merges,
      contentSheet: policies.contentSheet,
      gscMissCount: 0,
      dateRange: { startDate: "", endDate: "" },
      analyzedAt: "2026-06-01T00:00:00.000Z",
      runMode: "wordpress" as const,
      gridMaxUrlsPerPost: 1 as const,
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    };

    const familyRows = buildRedirectMapFamilyRows(result);
    expect(familyRows).toHaveLength(2);
    expect(familyRows[0]?.familyId).toBe(familyRows[1]?.familyId);
    expect(familyRows[0]?.destinationUrl).toBe(familyRows[1]?.destinationUrl);

    const wide = buildRedirectMapFamilyWideCsv(result);
    expect(wide).toContain("family_id");
    expect(wide.split("\n").length).toBe(3);

    const rankMath = buildRedirectMapFamilyRedirectCsvCsv(result);
    expect(rankMath).toContain("family_id");
    expect(rankMath).toContain("blog/auto-repair-business/");
    expect(rankMath.split("\n").filter((l) => l.includes("auto-repair-business")).length).toBe(2);

    const contentCsv = buildSitemapOptimizerContentSheetCsv(result);
    expect(contentCsv.split(/\r?\n/).filter((l) => l.length > 0).length).toBe(2);
    expect(contentCsv.split(/\r?\n/)[0]).toContain("keyword");
    expect(contentCsv).toContain("featuredImage");
  });
});
