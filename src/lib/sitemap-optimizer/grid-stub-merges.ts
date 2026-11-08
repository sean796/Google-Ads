import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

/** Deterministic merge rows for NEO Pulse redirect (no OpenRouter content briefs). */
export function buildGridStubMerges(
  clusters: SitemapOptimizerClusterResult,
  rows: SitemapOptimizerPostRow[],
): SitemapOptimizerMergeRecommendation[] {
  const rowMap = new Map(rows.map((r) => [r.postId, r]));

  return clusters.clusters.map((cluster) => {
    const members = resolvedMemberRows(cluster, rowMap);
    const primary = members[0];
    const title = displayPostTitle(cluster.label.trim() || primary?.title.trim() || "New blog post");
    const keyword = (primary?.title.trim() || cluster.label.trim()).slice(0, 40) || "blog topic";
    const metaBase = `Consolidated page for ${members.length} GSC URL(s).`;
    const meta = metaBase.length <= 160 ? metaBase : `${metaBase.slice(0, 157).trim()}...`;

    return {
      clusterId: cluster.clusterId,
      recommendedTitle: title.length <= 60 ? title : `${title.slice(0, 57).trim()}...`,
      recommendedPrimaryKeyword: keyword,
      recommendedMeta: meta,
      combinedOutline: [],
      whatToKeepFromEach: members.map((row) => ({
        url: row.url,
        title: row.title,
        bullets: [],
      })),
      redirectOrCanonicalNote: "NEO Pulse redirect redirect to proposed slug.",
      priority: "medium",
      confidence: "medium",
      rationale: "Grid NEO Pulse redirect only (cluster label + URL slug, no full brief).",
    };
  });
}
