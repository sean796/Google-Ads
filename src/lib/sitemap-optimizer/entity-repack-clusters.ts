import {
  entityCompressionBucketKey,
  entityPillarSortKey,
} from "@/lib/sitemap-optimizer/entity-compression-buckets";
import type { GridCompressionLevel } from "@/lib/sitemap-optimizer/grid-compression-policy";
import type { GridMaxUrlsPerPost } from "@/lib/sitemap-optimizer/grid-macro-cluster-policy";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerClusterResult,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

function sortPostIdsByPillar(
  ids: readonly string[],
  rowById: Map<string, SitemapOptimizerPostRow>,
): string[] {
  return [...ids].sort((a, b) => {
    const ra = rowById.get(a);
    const rb = rowById.get(b);
    const scoreDiff = entityPillarSortKey(rb ?? ({} as SitemapOptimizerPostRow)) -
      entityPillarSortKey(ra ?? ({} as SitemapOptimizerPostRow));
    if (scoreDiff !== 0) return scoreDiff;
    return (ra?.url ?? "").localeCompare(rb?.url ?? "");
  });
}

function packIdsIntoClusters(args: {
  bucketKey: string;
  bucketIndex: number;
  sortedIds: string[];
  rowById: Map<string, SitemapOptimizerPostRow>;
  maxUrlsPerPost: GridMaxUrlsPerPost;
  rationale: string;
}): SitemapOptimizerCluster[] {
  const { bucketKey, bucketIndex, sortedIds, rowById, maxUrlsPerPost, rationale } = args;
  const clusters: SitemapOptimizerCluster[] = [];
  const chunks: string[][] = [];

  for (let offset = 0; offset < sortedIds.length; offset += maxUrlsPerPost) {
    chunks.push(sortedIds.slice(offset, offset + maxUrlsPerPost));
  }

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1]!;
    const prev = chunks[chunks.length - 2]!;
    if (
      maxUrlsPerPost >= 3 &&
      last.length > 0 &&
      last.length < 3 &&
      prev.length + last.length <= maxUrlsPerPost
    ) {
      chunks[chunks.length - 2] = [...prev, ...last];
      chunks.pop();
    }
  }

  for (let part = 0; part < chunks.length; part += 1) {
    const chunk = chunks[part]!;
    if (!chunk.length) continue;
    const pillar = rowById.get(chunk[0]!);
    const partNum = part + 1;
    const label =
      pillar?.title?.trim() ||
      bucketKey.replace(/^metro:|^place:|^theme:/, "").replace(/\|/g, " ").replace(/_/g, " ");
    clusters.push({
      clusterId: `entity-compress-${bucketIndex}-${partNum}`,
      label,
      intent: "local",
      memberPostIds: chunk,
      confidence: "high",
      rationale,
    });
  }

  return clusters;
}

/** Pack service-area URLs into clusters using entity-specific bucket keys. */
/** @deprecated SAP runs use GSC triage + AI clustering instead of compression packing. */
export function repackEntityClustersByCompression(
  rows: readonly SitemapOptimizerPostRow[],
  options: {
    compression: GridCompressionLevel;
    maxUrlsPerPost: GridMaxUrlsPerPost;
    allowMetroMerge?: boolean;
  },
): SitemapOptimizerClusterResult {
  const { compression, maxUrlsPerPost, allowMetroMerge = true } = options;
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const byBucket = new Map<string, string[]>();

  for (const row of rows) {
    const key = entityCompressionBucketKey(row, compression, allowMetroMerge);
    const list = byBucket.get(key) ?? [];
    list.push(row.postId);
    byBucket.set(key, list);
  }

  const bucketKeys = [...byBucket.keys()].sort();
  const clusters: SitemapOptimizerCluster[] = [];
  const rationale = `Entity compression (${compression}): pack service-area URLs up to ${maxUrlsPerPost}:1`;

  for (let bucketIndex = 0; bucketIndex < bucketKeys.length; bucketIndex += 1) {
    const bucketKey = bucketKeys[bucketIndex]!;
    const sorted = sortPostIdsByPillar(byBucket.get(bucketKey)!, rowById);
    clusters.push(
      ...packIdsIntoClusters({
        bucketKey,
        bucketIndex,
        sortedIds: sorted,
        rowById,
        maxUrlsPerPost,
        rationale,
      }),
    );
  }

  return { clusters, singletons: [] };
}
