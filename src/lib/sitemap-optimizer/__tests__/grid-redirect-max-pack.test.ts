import { describe, expect, it } from "vitest";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildDeterministicGridBriefs } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import { clusterRedirectMapForFamilies } from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import { buildRedirectMapFamilyRows } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { normalizeGridDestinationKey } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import {
  countRedirectSourcesPerDestination,
  maxRedirectSourcesPerDestination,
} from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function redirectRow(args: {
  id: string;
  oldUrl: string;
  newUrl: string;
  title?: string;
  uploadRowIndex?: number;
}): SitemapOptimizerPostRow {
  return {
    postId: args.id,
    url: args.newUrl,
    gridRedirectFromUrl: args.oldUrl,
    uploadRowIndex: args.uploadRowIndex,
    collection: "posts",
    title: args.title ?? `Topic ${args.id}`,
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
  };
}

describe("redirect map max URLs per post (5:1)", () => {
  it("packs 15 sources into 3 clusters (5 each) without suffix duplicate slugs", () => {
    const dest = "https://www.kwbllp.com/blog/profit-improvement-strategies/";
    const rows = Array.from({ length: 15 }, (_, i) =>
      redirectRow({
        id: `wp:${i}`,
        oldUrl: `https://www.kwbllp.com/2020/03/profit-strategy-${i}/`,
        newUrl: dest,
        title: `Profit improvement strategy ${i + 1}`,
        uploadRowIndex: i,
      }),
    );

    const { clusters: draftClusters, rows: clusteredRows } = clusterRedirectMapForFamilies(rows, 5);
    expect(draftClusters.clusters).toHaveLength(3);
    expect(draftClusters.clusters.every((c) => c.memberPostIds.length <= 5)).toBe(true);

    const draftMerges = buildDeterministicGridBriefs(draftClusters.clusters, clusteredRows);
    expect(draftMerges).toHaveLength(3);

    const policies = applyGridOutputPolicies({
      rows: clusteredRows,
      clusters: draftClusters,
      merges: draftMerges,
      gridMaxUrlsPerPost: 5,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    const destKeys = [
      ...new Set(policies.rows.map((r) => normalizeGridDestinationKey(r.url))),
    ];
    expect(destKeys).toHaveLength(3);
    expect(maxRedirectSourcesPerDestination(countRedirectSourcesPerDestination(policies.rows))).toBe(
      5,
    );

    const csvKey = normalizeGridDestinationKey(dest);
    const primaryCount = policies.rows.filter(
      (r) => normalizeGridDestinationKey(r.url) === csvKey,
    ).length;
    expect(primaryCount).toBe(5);

    for (const key of destKeys) {
      expect(key).not.toMatch(/profit-improvement-strategies-\d+$/);
    }

    const titles = new Set(policies.contentSheet.map((r) => r.proposedTitle.trim()));
    expect(titles.size).toBe(3);
  });

  it("redirect export never exceeds max sources per destination after policies", () => {
    const dest = "https://example.com/blog/profit-improvement-strategies/";
    const rows = Array.from({ length: 12 }, (_, i) =>
      redirectRow({
        id: `wp:${i}`,
        oldUrl: `https://example.com/legacy/${i}/`,
        newUrl: dest,
        uploadRowIndex: i,
      }),
    );

    const { clusters: draftClusters, rows: clusteredRows } = clusterRedirectMapForFamilies(rows, 5);
    const draftMerges = buildDeterministicGridBriefs(draftClusters.clusters, clusteredRows);
    const policies = applyGridOutputPolicies({
      rows: clusteredRows,
      clusters: draftClusters,
      merges: draftMerges,
      gridMaxUrlsPerPost: 5,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    const destCounts = countRedirectSourcesPerDestination(policies.rows);
    expect(maxRedirectSourcesPerDestination(destCounts)).toBeLessThanOrEqual(5);

    const result = {
      rows: policies.rows,
      clusters: policies.clusters,
      merges: policies.merges,
      contentSheet: policies.contentSheet,
      gscMissCount: 0,
      dateRange: { startDate: "", endDate: "" },
      analyzedAt: "2026-06-01T00:00:00.000Z",
      runMode: "wordpress" as const,
      gridMaxUrlsPerPost: 5 as const,
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    };

    const familyRows = buildRedirectMapFamilyRows(result);
    const byDest = new Map<string, number>();
    for (const row of familyRows) {
      const key = (row.destinationUrl ?? "").trim();
      if (!key) continue;
      byDest.set(key, (byDest.get(key) ?? 0) + 1);
    }
    expect(Math.max(0, ...byDest.values())).toBeLessThanOrEqual(5);
    expect(policies.contentSheet.length).toBeGreaterThanOrEqual(3);
  });
});
