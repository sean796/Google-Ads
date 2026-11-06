import {
  gridMemberCanonicalUrl,
  gridMemberSourceUrl,
} from "@/lib/sitemap-optimizer/grid-member-url";
import { sharedGridClusterDestinationUrl } from "@/lib/sitemap-optimizer/grid-merge-group-ids";
import { isRedirectMapOverflowPackCluster } from "@/lib/sitemap-optimizer/grid-redirect-pack-cluster";
import { isTemporalCannibalizationCluster } from "@/lib/sitemap-optimizer/grid-temporal-cannibalization";
import { lockedDestinationForRedirectMapCluster } from "@/lib/sitemap-optimizer/grid-redirect-destination";
import { oneToOneRedirectMapLabel } from "@/lib/sitemap-optimizer/grid-one-to-one-redirect-map";
import { pickCanonicalDestinationUrl } from "@/lib/sitemap-optimizer/grid-cannibalization-family";
import { yearsInText } from "@/lib/sitemap-optimizer/grid-title-year";
import { normalizeGridTopicTag } from "@/lib/sitemap-optimizer/grid-tag-key";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

export function buildOneToOneTopicSections(
  targets: readonly SitemapOptimizerCluster[],
  rowById: Map<string, SitemapOptimizerPostRow>,
): TopicTagSection[] {
  return [...targets]
    .sort((a, b) => {
      const ia =
        rowById.get(a.memberPostIds[0] ?? "")?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
      const ib =
        rowById.get(b.memberPostIds[0] ?? "")?.uploadRowIndex ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return a.clusterId.localeCompare(b.clusterId);
    })
    .map((cluster) => {
      const member = resolvedMembers(cluster, rowById)[0];
      return {
        topicKey: cluster.clusterId,
        topicTag: member?.gridTopicTag ?? "untagged",
        tagLabel: member ? oneToOneRedirectMapLabel(member) : cluster.label,
        clusters: [cluster],
      };
    });
}

export type TopicTagSection = {
  topicKey: string;
  topicTag: string;
  tagLabel: string;
  clusters: SitemapOptimizerCluster[];
};

export type GridBlogBriefSectionProgress = {
  topicsCompleted: number;
  topicsTotal: number;
  currentTopicLabel?: string;
  blogsCompleted: number;
  blogsTotal: number;
  topicsInFlight?: number;
  microStep?: string;
  mergeBatchCompleted?: number;
  mergeBatchTotal?: number;
};

export async function mapTopicsWithConcurrency<R>(
  topics: readonly TopicTagSection[],
  concurrency: number,
  fn: (topic: TopicTagSection) => Promise<R>,
  signal?: AbortSignal,
  onSectionDone?: (completed: number, total: number, result: R) => void,
): Promise<R[]> {
  const n = topics.length;
  const ret: R[] = new Array(n);
  let next = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = next;
      next += 1;
      if (idx >= n) return;
      const topic = topics[idx]!;
      const result = await fn(topic);
      ret[idx] = result;
      finished += 1;
      onSectionDone?.(finished, n, result);
    }
  }

  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

export function resolvedMembers(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
): SitemapOptimizerPostRow[] {
  return cluster.memberPostIds
    .map((id) => rowById.get(id))
    .filter((r): r is SitemapOptimizerPostRow => r != null);
}

export function memberPayload(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
): Record<string, unknown>[] {
  return cluster.memberPostIds
    .map((id) => rowById.get(id))
    .filter((row): row is SitemapOptimizerPostRow => row != null)
    .map((row) => ({
      postId: row.postId,
      url: gridMemberSourceUrl(row),
      canonicalUrl: gridMemberCanonicalUrl(row),
      title: row.title,
      topicTag: row.gridTopicTag,
      geoTag: row.gridGeoTag,
      tagLabel: row.gridTagLabel,
      uploadRowIndex: row.uploadRowIndex,
      gscPageClicks: row.gscPageClicks,
      gscPageImpressions: row.gscPageImpressions,
    }));
}

/** Group clusters by normalized gridTopicTag from member rows. */
export function groupClustersByTopicTag(
  clusters: readonly SitemapOptimizerCluster[],
  rowById: Map<string, SitemapOptimizerPostRow>,
): TopicTagSection[] {
  const byKey = new Map<string, TopicTagSection>();

  for (const cluster of clusters) {
    const members = resolvedMembers(cluster, rowById);
    const first = members[0];
    const topicTag = normalizeGridTopicTag(first?.gridTopicTag ?? "untagged");
    const tagLabel = first?.gridTagLabel?.trim() || cluster.label.trim() || topicTag.replace(/_/g, " ");
    const existing = byKey.get(topicTag);
    if (existing) {
      existing.clusters.push(cluster);
    } else {
      byKey.set(topicTag, { topicKey: topicTag, topicTag, tagLabel, clusters: [cluster] });
    }
  }

  return [...byKey.values()].sort((a, b) => a.topicTag.localeCompare(b.topicTag));
}

export function chunkClusters(
  clusters: readonly SitemapOptimizerCluster[],
  size: number,
): SitemapOptimizerCluster[][] {
  const chunks: SitemapOptimizerCluster[][] = [];
  for (let i = 0; i < clusters.length; i += size) {
    chunks.push(clusters.slice(i, i + size));
  }
  return chunks;
}

export function buildClusterPayload(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
): Record<string, unknown> {
  const resolved = resolvedMembers(cluster, rowById);
  const isOverflow = isRedirectMapOverflowPackCluster(cluster);
  const isTemporal = isTemporalCannibalizationCluster(cluster);
  const presetDestination = isOverflow
    ? null
    : (lockedDestinationForRedirectMapCluster(resolved, cluster) ??
      (!isTemporal ? sharedGridClusterDestinationUrl(resolved) : null));
  const legacySource =
    resolved.length === 1 && resolved[0]?.gridRedirectFromUrl?.trim()
      ? gridMemberSourceUrl(resolved[0])
      : undefined;
  const permalinkSamples: string[] = [];
  for (const row of resolved) {
    try {
      permalinkSamples.push(new URL(gridMemberCanonicalUrl(row)).pathname);
    } catch {
      /* skip */
    }
    if (permalinkSamples.length >= 5) break;
  }
  const tagLabel = resolved[0]?.gridTagLabel ?? cluster.label;
  const yearsRequiredInTitle = yearsInText(
    [tagLabel, cluster.label, ...permalinkSamples].filter(Boolean).join(" "),
  );
  const canonicalDestinationUrl =
    presetDestination ?? (resolved.length > 0 ? pickCanonicalDestinationUrl(resolved) : undefined);

  return {
    clusterId: cluster.clusterId,
    label: cluster.label,
    intent: cluster.intent,
    rationale: cluster.rationale,
    topicTag: resolved[0]?.gridTopicTag ?? "",
    tagLabel,
    memberCount: resolved.length,
    ...(isOverflow
      ? {
          overflowPackCluster: true,
          overflowPackRule:
            "Max URLs per post reached for the CSV new_url. Write a NEW distinct recommendedTitle and lockedDestinationUrl slug from this subset only. Do NOT reuse the CSV canonical URL or append -2/-3 suffixes.",
        }
      : {}),
    ...(isTemporal
      ? {
          temporalCannibalizationExempt: true,
          temporalPillarRule:
            "Time-sliced variants (quarters, tax season, dated archive posts) of the same topic. Output ONE annual/topic pillar: combine all time angles as H2 sections. One lockedDestinationUrl without quarter/month suffixes when possible.",
        }
      : {}),
    ...(resolved.length > 1 ? { mergedTopicGroup: true } : {}),
    ...(yearsRequiredInTitle.length
      ? { yearsRequiredInTitle, titleMustIncludeYear: yearsRequiredInTitle[0] }
      : {}),
    permalinkSamples,
    ...(canonicalDestinationUrl
      ? { lockedDestinationUrl: canonicalDestinationUrl, canonicalDestinationUrl }
      : {}),
    ...(legacySource ? { legacySourceUrl: legacySource } : {}),
    members: memberPayload(cluster, rowById),
  };
}
