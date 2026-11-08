import {
  computeTopicGroupKeysForRedirectMap,
  isMergedTopicGroup,
  pickCanonicalDestinationUrl,
  redirectMapClusterBucketKey,
} from "@/lib/sitemap-optimizer/grid-cannibalization-family";
import { splitOversizedGridClusters } from "@/lib/sitemap-optimizer/grid-finalize-clusters";
import type { TemporalCannibalizationExemptResult } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization-agent";
import type { GridMaxUrlsPerPost } from "@/lib/sitemap-optimizer/grid-macro-cluster-policy";
import { normalizeGridDestinationKey } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { gridMemberCanonicalUrl } from "@/lib/sitemap-optimizer/grid-member-url";
import { resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

/** When every row has a CSV `group`, cluster exactly by that id (redirect grid uploads). */
export function tryClusterByPrefilledGridGroup(
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult | null {
  if (!rows.length) return null;

  const byGroup = new Map<number, string[]>();
  for (const row of rows) {
    const g = row.gridRedirectGroup;
    if (g == null || !Number.isFinite(g)) return null;
    const list = byGroup.get(g) ?? [];
    list.push(row.postId);
    byGroup.set(g, list);
  }

  const clusters = [...byGroup.entries()]
    .sort(([a], [b]) => a - b)
    .map(([groupId, memberPostIds]) => {
      const first = rows.find((r) => r.postId === memberPostIds[0]);
      return {
        clusterId: `grid-group-${groupId}`,
        label: first?.gridTagLabel?.trim() || first?.title?.trim() || `Group ${groupId}`,
        intent: "mixed",
        memberPostIds,
        confidence: "high" as const,
        rationale: "Pre-grouped from redirect grid CSV.",
      };
    });

  return { clusters, singletons: [] };
}

/** Cluster redirect-map rows that share the same CSV new_url (Sheet2-style N→1). */
export function tryClusterBySharedNewUrl(
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult | null {
  if (!rows.length) return null;
  if (!rows.every((r) => r.gridRedirectFromUrl?.trim())) return null;

  const byDestination = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeGridDestinationKey(gridMemberCanonicalUrl(row));
    if (!key) return null;
    const list = byDestination.get(key) ?? [];
    list.push(row.postId);
    byDestination.set(key, list);
  }

  const clusters = [...byDestination.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destKey, memberPostIds], index) => {
      const first = rows.find((r) => r.postId === memberPostIds[0]);
      return {
        clusterId: `grid-dest-${index + 1}`,
        label: first?.title?.trim() || destKey,
        intent: "mixed",
        memberPostIds,
        confidence: "high" as const,
        rationale: "Grouped by shared new_url from redirect map CSV.",
      };
    });

  return { clusters, singletons: [] };
}

function packClusterMemberIds(
  memberPostIds: readonly string[],
  rowById: Map<string, SitemapOptimizerPostRow>,
  maxUrlsPerPost: GridMaxUrlsPerPost,
): string[][] {
  const sorted = [...memberPostIds].sort((a, b) => {
    const ra = rowById.get(a)?.uploadRowIndex ?? 0;
    const rb = rowById.get(b)?.uploadRowIndex ?? 0;
    if (ra !== rb) return ra - rb;
    return (rowById.get(a)?.url ?? "").localeCompare(rowById.get(b)?.url ?? "");
  });
  const chunks: string[][] = [];
  for (let offset = 0; offset < sorted.length; offset += maxUrlsPerPost) {
    chunks.push(sorted.slice(offset, offset + maxUrlsPerPost));
  }
  return chunks;
}

/** Cluster redirect-map rows by shared new_url, capped at maxUrlsPerPost members per cluster. */
export function tryClusterBySharedNewUrlPacked(
  rows: readonly SitemapOptimizerPostRow[],
  maxUrlsPerPost: GridMaxUrlsPerPost,
): SitemapOptimizerClusterResult | null {
  if (!rows.length) return null;
  if (!rows.every((r) => r.gridRedirectFromUrl?.trim())) return null;

  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const byDestination = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeGridDestinationKey(gridMemberCanonicalUrl(row));
    if (!key) return null;
    const list = byDestination.get(key) ?? [];
    list.push(row.postId);
    byDestination.set(key, list);
  }

  const clusters: SitemapOptimizerCluster[] = [];
  let destIndex = 0;
  for (const [destKey, memberPostIds] of [...byDestination.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const chunks = packClusterMemberIds(memberPostIds, rowById, maxUrlsPerPost);
    for (let part = 0; part < chunks.length; part += 1) {
      const chunk = chunks[part]!;
      const first = rowById.get(chunk[0]!);
      clusters.push({
        clusterId: `grid-dest-${destIndex + 1}-part-${part + 1}`,
        label: first?.title?.trim() || destKey,
        intent: "mixed",
        memberPostIds: chunk,
        confidence: "high" as const,
        rationale:
          chunks.length > 1
            ? part === 0
              ? `Up to ${maxUrlsPerPost} URLs per post (CSV new_url family).`
              : `Overflow blog ${part + 1} — max ${maxUrlsPerPost} URLs per destination.`
            : "Grouped by shared new_url from redirect map CSV.",
      });
    }
    destIndex += 1;
  }

  return { clusters, singletons: [] };
}

/** Pre-grouped CSV rows, capped at maxUrlsPerPost members per cluster. */
export function tryClusterByPrefilledGridGroupPacked(
  rows: readonly SitemapOptimizerPostRow[],
  maxUrlsPerPost: GridMaxUrlsPerPost,
): SitemapOptimizerClusterResult | null {
  const base = tryClusterByPrefilledGridGroup(rows);
  if (!base) return null;

  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const clusters: SitemapOptimizerCluster[] = [];
  for (const cluster of base.clusters) {
    const chunks = packClusterMemberIds(cluster.memberPostIds, rowById, maxUrlsPerPost);
    for (let part = 0; part < chunks.length; part += 1) {
      const chunk = chunks[part]!;
      clusters.push({
        ...cluster,
        clusterId:
          chunks.length > 1 ? `${cluster.clusterId}-part-${part + 1}` : cluster.clusterId,
        memberPostIds: chunk,
        rationale:
          chunks.length > 1
            ? part === 0
              ? `Up to ${maxUrlsPerPost} URLs per post (CSV group).`
              : `Overflow blog ${part + 1} — max ${maxUrlsPerPost} URLs per destination.`
            : cluster.rationale,
      });
    }
  }
  return { clusters, singletons: [] };
}

/** Apply brief lockedDestinationUrl to each cluster member row. */
export function applyMergeLockedDestinationsToRows(
  rows: readonly SitemapOptimizerPostRow[],
  clusters: SitemapOptimizerClusterResult,
  merges: readonly SitemapOptimizerMergeRecommendation[],
): SitemapOptimizerPostRow[] {
  const mergeByCluster = new Map(merges.map((m) => [m.clusterId, m]));
  const urlByPostId = new Map<string, string>();

  for (const cluster of clusters.clusters) {
    const merge = mergeByCluster.get(cluster.clusterId);
    const locked = merge?.lockedDestinationUrl?.trim();
    if (!locked) continue;
    for (const id of cluster.memberPostIds) {
      urlByPostId.set(id, locked);
    }
  }

  return rows.map((row) => {
    const url = urlByPostId.get(row.postId);
    return url ? { ...row, url } : row;
  });
}

function destinationKeyForClusterMembers(
  members: readonly SitemapOptimizerPostRow[],
): string {
  if (!members.length) return "";
  return normalizeGridDestinationKey(gridMemberCanonicalUrl(members[0]!));
}

/** Merge clusters that share the same new_url so 1:1 redirect maps get one content plan per destination. */
export function coalesceGridClustersByDestination(
  result: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult {
  if (!rows.length || !rows.every((r) => r.gridRedirectFromUrl?.trim())) {
    return result;
  }

  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const memberIds = new Set<string>();
  const byDest = new Map<
    string,
    { memberPostIds: string[]; label: string; rationale: string }
  >();

  const absorbCluster = (cluster: SitemapOptimizerCluster) => {
    const members = resolvedMemberRows(cluster, rowById);
    const destKey = destinationKeyForClusterMembers(members);
    if (!destKey) return;
    const bucket = byDest.get(destKey) ?? {
      memberPostIds: [],
      label: cluster.label,
      rationale: cluster.rationale,
    };
    for (const id of cluster.memberPostIds) {
      if (!memberIds.has(id)) {
        memberIds.add(id);
        bucket.memberPostIds.push(id);
      }
    }
    byDest.set(destKey, bucket);
  };

  for (const cluster of result.clusters) absorbCluster(cluster);

  for (const id of result.singletons) {
    const row = rowById.get(id);
    if (!row) continue;
    const destKey = normalizeGridDestinationKey(gridMemberCanonicalUrl(row));
    if (!destKey) continue;
    const bucket = byDest.get(destKey) ?? {
      memberPostIds: [],
      label: row.title?.trim() || row.gridTagLabel?.trim() || "Redirect target",
      rationale: "Grouped by shared new_url from redirect map CSV.",
    };
    if (!memberIds.has(id)) {
      memberIds.add(id);
      bucket.memberPostIds.push(id);
    }
    byDest.set(destKey, bucket);
  }

  const clusters = [...byDest.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destKey, bucket], index) => {
      const sortedIds = [...bucket.memberPostIds].sort((a, b) => {
        const ra = rowById.get(a)?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
        const rb = rowById.get(b)?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      const first = rowById.get(sortedIds[0]!);
      return {
        clusterId: `grid-dest-${index + 1}`,
        label: first?.gridTagLabel?.trim() || first?.title?.trim() || bucket.label || destKey,
        intent: first?.gridIntent ?? "mixed",
        memberPostIds: sortedIds,
        confidence: "high" as const,
        rationale:
          sortedIds.length > 1
            ? `${sortedIds.length} source URLs share one new_url — one content plan.`
            : bucket.rationale,
      };
    });

  return { clusters, singletons: [] };
}

/** Merge clusters that share the same near-duplicate topic group (general token/slug rules). */
export function coalesceGridClustersByCannibalizationFamily(
  result: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult {
  if (!rows.length || !rows.every((r) => r.gridRedirectFromUrl?.trim())) {
    return result;
  }

  const topicGroupKeys = computeTopicGroupKeysForRedirectMap(rows);
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const memberIds = new Set<string>();
  const byBucket = new Map<
    string,
    { memberPostIds: string[]; label: string; rationale: string; isMergedTopic: boolean }
  >();

  const absorbPostId = (
    postId: string,
    label: string,
    rationale: string,
    isMergedTopic: boolean,
  ) => {
    const row = rowById.get(postId);
    if (!row) return;
    const bucketKey = redirectMapClusterBucketKey(row, topicGroupKeys);
    if (!bucketKey) return;
    const bucket = byBucket.get(bucketKey) ?? {
      memberPostIds: [],
      label,
      rationale,
      isMergedTopic,
    };
    if (!memberIds.has(postId)) {
      memberIds.add(postId);
      bucket.memberPostIds.push(postId);
    }
    byBucket.set(bucketKey, bucket);
  };

  for (const cluster of result.clusters) {
    for (const id of cluster.memberPostIds) {
      const row = rowById.get(id);
      absorbPostId(
        id,
        cluster.label,
        cluster.rationale,
        Boolean(row && isMergedTopicGroup(row, topicGroupKeys)),
      );
    }
  }

  for (const id of result.singletons) {
    const row = rowById.get(id);
    absorbPostId(
      id,
      row?.title?.trim() || row?.gridTagLabel?.trim() || "Redirect target",
      "Grouped for redirect map.",
      Boolean(row && isMergedTopicGroup(row, topicGroupKeys)),
    );
  }

  const clusters = [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket], index) => {
      const sortedIds = [...bucket.memberPostIds].sort((a, b) => {
        const ra = rowById.get(a)?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
        const rb = rowById.get(b)?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      const first = rowById.get(sortedIds[0]!);
      return {
        clusterId: `grid-family-${index + 1}`,
        label: first?.gridTagLabel?.trim() || first?.title?.trim() || bucket.label,
        intent: first?.gridIntent ?? "mixed",
        memberPostIds: sortedIds,
        confidence: "high" as const,
        rationale:
          sortedIds.length > 1 && bucket.isMergedTopic
            ? `${sortedIds.length} near-duplicate topics — one content plan (anti-cannibalization).`
            : sortedIds.length > 1
              ? `${sortedIds.length} source URLs share one new_url — one content plan.`
              : bucket.rationale,
      };
    });

  return { clusters, singletons: [] };
}

export function applyCanonicalDestinationUrlsToRows(
  rows: readonly SitemapOptimizerPostRow[],
  clusters: SitemapOptimizerClusterResult,
): SitemapOptimizerPostRow[] {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const urlByPostId = new Map<string, string>();

  for (const cluster of clusters.clusters) {
    const members = resolvedMemberRows(cluster, rowById);
    if (!members.length) continue;
    const canonical = pickCanonicalDestinationUrl(members);
    for (const m of members) {
      urlByPostId.set(m.postId, canonical);
    }
  }

  return rows.map((row) => {
    const canonical = urlByPostId.get(row.postId);
    return canonical ? { ...row, url: canonical } : row;
  });
}

/** Full 1:1 redirect-map clustering: destination, cannibalization family, canonical URLs. */
export function clusterRedirectMapForOneToOne(
  rows: readonly SitemapOptimizerPostRow[],
): { clusters: SitemapOptimizerClusterResult; rows: SitemapOptimizerPostRow[] } {
  let clusters = clusterRedirectMapByDestination(rows, 1);
  clusters = coalesceGridClustersByCannibalizationFamily(clusters, rows);
  let updatedRows = applyCanonicalDestinationUrlsToRows(rows, clusters);
  clusters = coalesceGridClustersByDestination(clusters, updatedRows);
  updatedRows = applyCanonicalDestinationUrlsToRows(updatedRows, clusters);
  return { clusters, rows: updatedRows };
}

/**
 * Redirect-map clustering honoring max URLs per post (e.g. 5:1).
 * Overflow packs become separate clusters; briefs assign new titles/destinations.
 */
export function clusterRedirectMapForFamilies(
  rows: readonly SitemapOptimizerPostRow[],
  maxUrlsPerPost: GridMaxUrlsPerPost,
  temporalExempt: TemporalCannibalizationExemptResult = { clusters: [], exemptPostIds: new Set() },
): { clusters: SitemapOptimizerClusterResult; rows: SitemapOptimizerPostRow[] } {
  const { clusters: temporalClusters, exemptPostIds } = temporalExempt;

  if (maxUrlsPerPost === 1) {
    const remaining = rows.filter((r) => !exemptPostIds.has(r.postId));
    let clusters: SitemapOptimizerClusterResult = {
      clusters: [...temporalClusters],
      singletons: [],
    };
    let updatedRows = [...rows];
    if (remaining.length > 0) {
      const oneToOne = clusterRedirectMapForOneToOne(remaining);
      clusters = {
        clusters: [...clusters.clusters, ...oneToOne.clusters.clusters],
        singletons: oneToOne.clusters.singletons,
      };
      const rowById = new Map(oneToOne.rows.map((r) => [r.postId, r]));
      updatedRows = rows.map((r) => rowById.get(r.postId) ?? r);
    }

    return { clusters, rows: updatedRows };
  }
  const remaining = rows.filter((r) => !exemptPostIds.has(r.postId));
  const packed =
    remaining.length > 0
      ? clusterRedirectMapByDestination(remaining, maxUrlsPerPost)
      : { clusters: [] as SitemapOptimizerCluster[], singletons: [] as string[] };

  let clusters: SitemapOptimizerClusterResult = {
    clusters: [...temporalClusters, ...packed.clusters],
    singletons: packed.singletons,
  };
  clusters = splitOversizedGridClusters(clusters, maxUrlsPerPost, rows, {
    splitSharedDestinations: true,
  });

  return { clusters, rows: [...rows] };
}

/** One upload row = one cluster (max URLs per post = 1). */
export function clusterOneRowPerUpload(
  rows: readonly SitemapOptimizerPostRow[],
): SitemapOptimizerClusterResult {
  const clusters = rows.map((row, index) => ({
    clusterId: `grid-row-${row.postId}`,
    label: row.gridTagLabel?.trim() || row.title?.trim() || `Row ${index + 1}`,
    intent: row.gridIntent ?? "mixed",
    memberPostIds: [row.postId],
    confidence: "high" as const,
    rationale: "One URL per cluster (max 1 URL per new post).",
  }));
  return { clusters, singletons: [] };
}

export function rowsHavePrefilledGridTags(rows: readonly SitemapOptimizerPostRow[]): boolean {
  return rows.length > 0 && rows.every((r) => Boolean(r.gridTopicTag?.trim()));
}

/**
 * NEO Pulse redirect / redirect-map uploads: one content plan per destination (CSV group or shared new_url),
 * not one plan per source row when many old URLs share the same new_url.
 */
export function clusterRedirectMapByDestination(
  rows: readonly SitemapOptimizerPostRow[],
  maxUrlsPerPost: GridMaxUrlsPerPost = 1,
): SitemapOptimizerClusterResult {
  if (maxUrlsPerPost > 1) {
    const byDest = tryClusterBySharedNewUrlPacked(rows, maxUrlsPerPost);
    if (byDest) return byDest;
    const byGroup = tryClusterByPrefilledGridGroupPacked(rows, maxUrlsPerPost);
    if (byGroup) return byGroup;
    return clusterOneRowPerUpload(rows);
  }
  const byDest = tryClusterBySharedNewUrl(rows);
  if (byDest) return byDest;
  const byGroup = tryClusterByPrefilledGridGroup(rows);
  if (byGroup) return coalesceGridClustersByDestination(byGroup, rows);
  return clusterOneRowPerUpload(rows);
}
