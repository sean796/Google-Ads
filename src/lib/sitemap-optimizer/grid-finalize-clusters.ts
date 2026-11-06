import { ensureAllPostIdsInClusterResult } from "@/lib/sitemap-optimizer/ensure-cluster-catalog-coverage";
import type { SitemapOptimizerCluster, SitemapOptimizerClusterResult, SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";
import { sharedGridClusterDestinationUrl } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import type { GridMaxUrlsPerPost } from "@/lib/sitemap-optimizer/grid-macro-cluster-policy";
import { resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import { isTemporalCannibalizationCluster } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";

export type SplitOversizedGridClustersOptions = {
  /** When true, split even if every member shares the same CSV new_url. */
  splitSharedDestinations?: boolean;
};

/** Split any cluster larger than maxUrlsPerPost into multiple clusters. */
export function splitOversizedGridClusters(
  result: SitemapOptimizerClusterResult,
  maxUrlsPerPost: GridMaxUrlsPerPost,
  rows?: readonly SitemapOptimizerPostRow[],
  options?: SplitOversizedGridClustersOptions,
): SitemapOptimizerClusterResult {
  const rowById = rows ? new Map(rows.map((r) => [r.postId, r])) : null;
  const clusters: SitemapOptimizerCluster[] = [];

  for (const c of result.clusters) {
    const ids = c.memberPostIds;
    if (isTemporalCannibalizationCluster(c)) {
      clusters.push(c);
      continue;
    }
    if (ids.length <= maxUrlsPerPost) {
      clusters.push(c);
      continue;
    }
    if (rowById && !options?.splitSharedDestinations) {
      const members = resolvedMemberRows(c, rowById);
      if (sharedGridClusterDestinationUrl(members)) {
        clusters.push(c);
        continue;
      }
    }
    const partCount = Math.ceil(ids.length / maxUrlsPerPost);
    for (let part = 0; part < partCount; part += 1) {
      const chunk = ids.slice(part * maxUrlsPerPost, part * maxUrlsPerPost + maxUrlsPerPost);
      if (!chunk.length) continue;
      clusters.push({
        ...c,
        clusterId: partCount > 1 ? `${c.clusterId}-part-${part + 1}` : c.clusterId,
        label: c.label,
        memberPostIds: chunk,
      });
    }
  }

  return { clusters, singletons: result.singletons };
}

/** Every singleton becomes a 1-URL cluster (one brief + one redirect group). */
export function promoteGridSingletonsToClusters(
  result: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const clusters = [...result.clusters];

  for (const id of result.singletons) {
    const row = rowById.get(id);
    clusters.push({
      clusterId: `grid-solo-${id}`,
      label: row?.title?.trim() || "New blog post",
      intent: "mixed",
      memberPostIds: [id],
      confidence: "medium",
      rationale: "Single URL group (max cluster size reached for other groups).",
    });
  }

  return { clusters, singletons: [] };
}

export function finalizeGridClusterResult(
  draft: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
  maxUrlsPerPost: GridMaxUrlsPerPost,
): SitemapOptimizerClusterResult {
  const allPostIds = rows.map((r) => r.postId);
  let result = splitOversizedGridClusters(draft, maxUrlsPerPost, rows);
  result = ensureAllPostIdsInClusterResult(allPostIds, result);
  result = promoteGridSingletonsToClusters(result, rows);
  return ensureAllPostIdsInClusterResult(allPostIds, result);
}
