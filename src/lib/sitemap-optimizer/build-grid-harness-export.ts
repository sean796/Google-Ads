import { buildGridPublishContracts } from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import {
  buildMergeGroupNumbersForGridResult,
  mergeGroupNumberForDestination,
} from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { gridClusterForPostId } from "@/lib/sitemap-optimizer/normalize-grid-cluster-assignments";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

function csvEsc(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function briefForPostId(
  postId: string,
  cluster: SitemapOptimizerCluster | undefined,
  merges: SitemapOptimizerMergeRecommendation[],
): SitemapOptimizerMergeRecommendation | undefined {
  if (!cluster) return undefined;
  return merges.find((m) => m.clusterId === cluster.clusterId);
}

export type GridHarnessExportRow = {
  uploadRow: number;
  mergeGroupId: number;
  topicTag: string;
  geoTag: string;
  tagLabel: string;
  sourceUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clusterId: string;
  clusterLabel: string;
  clusterSize: number;
  proposedNewBlogTitle: string;
  proposedKeyword: string;
  proposedMeta: string;
  blogPriority: string;
  isSingletonCluster: string;
  proposedDestinationUrl: string;
};

export function buildGridHarnessExportRows(result: SitemapOptimizerRunResult): GridHarnessExportRow[] {
  const { rows, clusters, merges } = result;
  const contractByCluster = new Map(
    buildGridPublishContracts(result).map((c) => [c.clusterId, c]),
  );
  const groupByDestination = buildMergeGroupNumbersForGridResult(result);
  const out: GridHarnessExportRow[] = [];

  for (const row of rows) {
    const cluster = gridClusterForPostId(row.postId, clusters);
    const brief = briefForPostId(row.postId, cluster, merges);
    if (!cluster || !brief) {
      throw new Error(
        `Missing merge data for grid row ${row.uploadRowIndex ?? "?"} (${row.url}). Re-run analyze.`,
      );
    }
    const size = cluster.memberPostIds.length;
    const destinationUrl = contractByCluster.get(cluster.clusterId)?.destinationUrl ?? "";
    const mergeGroupId = mergeGroupNumberForDestination(destinationUrl, groupByDestination);
    out.push({
      uploadRow: row.uploadRowIndex ?? 0,
      mergeGroupId,
      topicTag: row.gridTopicTag ?? "",
      geoTag: row.gridGeoTag ?? "",
      tagLabel: row.gridTagLabel ?? "",
      sourceUrl: row.url,
      clicks: row.gscPageClicks ?? 0,
      impressions: row.gscPageImpressions ?? 0,
      ctr: row.gscPageCtr ?? 0,
      position: row.gscPagePosition ?? 0,
      clusterId: cluster.clusterId,
      clusterLabel: cluster.label,
      clusterSize: size,
      proposedNewBlogTitle: displayPostTitle(brief.recommendedTitle),
      proposedKeyword: brief.recommendedPrimaryKeyword,
      proposedMeta: brief.recommendedMeta,
      blogPriority: brief.priority,
      isSingletonCluster: size <= 1 ? "yes" : "no",
      proposedDestinationUrl: destinationUrl,
    });
  }

  out.sort((a, b) => {
    if (a.mergeGroupId !== b.mergeGroupId) return a.mergeGroupId - b.mergeGroupId;
    return a.uploadRow - b.uploadRow;
  });
  return out;
}

export function buildGridHarnessExportCsv(result: SitemapOptimizerRunResult): string {
  const header = [
    "upload_row",
    "merge_group_id",
    "topic_tag",
    "geo_tag",
    "tag_label",
    "source_url",
    "clicks",
    "impressions",
    "ctr",
    "position",
    "cluster_id",
    "cluster_label",
    "cluster_size",
    "proposed_new_blog_title",
    "proposed_keyword",
    "proposed_meta",
    "blog_priority",
    "is_singleton_cluster",
    "proposed_destination_url",
  ];
  const rows = buildGridHarnessExportRows(result);
  const lines = rows.map((r) =>
    [
      r.uploadRow,
      r.mergeGroupId,
      r.topicTag,
      r.geoTag,
      r.tagLabel,
      r.sourceUrl,
      r.clicks,
      r.impressions,
      r.ctr,
      r.position,
      r.clusterId,
      r.clusterLabel,
      r.clusterSize,
      r.proposedNewBlogTitle,
      r.proposedKeyword,
      r.proposedMeta,
      r.blogPriority,
      r.isSingletonCluster,
      r.proposedDestinationUrl,
    ]
      .map((c) => csvEsc(String(c ?? "")))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
