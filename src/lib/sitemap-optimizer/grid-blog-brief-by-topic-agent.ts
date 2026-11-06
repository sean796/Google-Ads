import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_CLUSTERS_PER_SECTION,
  SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_SECTION_CONCURRENCY,
} from "@/lib/sitemap-optimizer/constants";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { blogDestinationPolicyForCollections } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  buildDeterministicGridBrief,
  fillMissingClusterBriefs,
} from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import { isGridOneToOneRedirectMap } from "@/lib/sitemap-optimizer/grid-one-to-one-redirect-map";
import type { GridMaxUrlsPerPost } from "@/lib/sitemap-optimizer/grid-macro-cluster-policy";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";
import {
  buildOneToOneTopicSections,
  chunkClusters,
  groupClustersByTopicTag,
  mapTopicsWithConcurrency,
  resolvedMembers,
  type GridBlogBriefSectionProgress,
} from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-helpers";
import { briefTopicSliceWithFullCoverage } from "@/lib/sitemap-optimizer/grid-blog-brief-slice";

export type {
  GridBlogBriefSectionProgress,
  TopicTagSection,
} from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-helpers";
export { groupClustersByTopicTag } from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-helpers";

/** Plan merge progress by canonical topic count (not API slice count). */
export function planGridBlogBriefTopics(
  clusterResult: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
  gridMaxUrlsPerPost?: GridMaxUrlsPerPost,
): { topicsTotal: number; blogsTotal: number } {
  const blogsTotal = clusterResult.clusters.length;
  if (isGridOneToOneRedirectMap(rows, gridMaxUrlsPerPost)) {
    return { topicsTotal: blogsTotal, blogsTotal };
  }
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const topics = groupClustersByTopicTag(clusterResult.clusters, rowById);
  return { topicsTotal: topics.length, blogsTotal };
}

/** @deprecated Use planGridBlogBriefTopics */
export function planGridBlogBriefSections(
  clusterResult: SitemapOptimizerClusterResult,
  rows: readonly SitemapOptimizerPostRow[],
): { sections: Array<{ topicTag: string; tagLabel: string; clusterCount: number }>; blogsTotal: number } {
  const { blogsTotal } = planGridBlogBriefTopics(clusterResult, rows);
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const topics = groupClustersByTopicTag(clusterResult.clusters, rowById);
  return {
    sections: topics.map((t) => ({
      topicTag: t.topicTag,
      tagLabel: t.tagLabel,
      clusterCount: t.clusters.length,
    })),
    blogsTotal,
  };
}

/** One OpenRouter batch per topic section; split incomplete slices (no per-cluster retry loop). */
export async function runGridBlogBriefByTopicAgent(
  clusterResult: SitemapOptimizerClusterResult,
  rows: SitemapOptimizerPostRow[],
  apiKey: string,
  signal?: AbortSignal,
  onProgress?: (p: GridBlogBriefSectionProgress) => void,
  gridMaxUrlsPerPost?: GridMaxUrlsPerPost,
  blogDestination?: BlogDestinationPolicy,
): Promise<SitemapOptimizerMergeRecommendation[]> {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const targets = clusterResult.clusters;
  if (!targets.length) return [];

  const blogPolicy =
    blogDestination ??
    blogDestinationPolicyForCollections(new Set(["posts"]), { gridCsv: true });

  const oneToOne = isGridOneToOneRedirectMap(rows, gridMaxUrlsPerPost);
  const topics = oneToOne
    ? buildOneToOneTopicSections(targets, rowById)
    : groupClustersByTopicTag(targets, rowById);
  const clustersPerBatch = oneToOne ? 1 : SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_CLUSTERS_PER_SECTION;
  const model = getResearchModel();
  const byClusterId = new Map<string, SitemapOptimizerMergeRecommendation>();
  const blogsTotal = targets.length;
  const topicsTotal = topics.length;
  const mergeBatchTotal = oneToOne
    ? blogsTotal
    : topics.reduce(
        (sum, topic) => sum + Math.ceil(topic.clusters.length / clustersPerBatch),
        0,
      );
  let mergeBatchStarted = 0;
  let mergeBatchCompleted = 0;

  const emit = (microStep: string, blogsCompleted: number) => {
    onProgress?.({
      topicsCompleted: mergeBatchCompleted >= mergeBatchTotal ? topicsTotal : 0,
      topicsTotal,
      currentTopicLabel: undefined,
      blogsCompleted,
      blogsTotal,
      topicsInFlight: Math.min(SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_SECTION_CONCURRENCY, topicsTotal),
      microStep,
      mergeBatchCompleted,
      mergeBatchTotal,
    });
  };

  const redirectRows = rows.filter((r) => r.gridRedirectFromUrl?.trim()).length;
  emit(
    oneToOne
      ? blogsTotal < redirectRows
        ? `Queued ${blogsTotal} content plan(s) · ${redirectRows} old URLs → shared new_url`
        : `Queued ${blogsTotal} content plan(s) · one per old → new pair`
      : `Queued ${blogsTotal} content plans · ${mergeBatchTotal} Gemini batches`,
    0,
  );

  await mapTopicsWithConcurrency(
    topics,
    SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_SECTION_CONCURRENCY,
    async (topic) => {
      const chunks = chunkClusters(topic.clusters, clustersPerBatch);
      for (let i = 0; i < chunks.length; i += 1) {
        const clusters = chunks[i]!;
        const batchNum = ++mergeBatchStarted;
        const member = oneToOne
          ? resolvedMembers(clusters[0]!, rowById)[0]
          : undefined;
        const rowNum = member?.uploadRowIndex;
        const topicLabel = topic.tagLabel?.trim() || topic.topicTag || "untagged";
        emit(
          oneToOne
            ? `Brief ${batchNum}/${mergeBatchTotal}${rowNum != null ? ` · row ${rowNum}` : ""} · ${topicLabel}`
            : `Calling Gemini · batch ${batchNum}/${mergeBatchTotal} · ${clusters.length} plans · ${topicLabel}`,
          byClusterId.size,
        );
        const suffix = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : "";
        const part = await briefTopicSliceWithFullCoverage(
          { topicTag: topic.topicTag, tagLabel: `${topic.tagLabel}${suffix}` },
          clusters,
          rowById,
          apiKey,
          model,
          signal,
          oneToOne,
          blogPolicy,
        );
        for (const [id, brief] of part) byClusterId.set(id, brief);
        mergeBatchCompleted += 1;
        emit(
          oneToOne
            ? `Brief ${mergeBatchCompleted}/${mergeBatchTotal} done · ${byClusterId.size}/${blogsTotal} rows`
            : `Batch ${mergeBatchCompleted}/${mergeBatchTotal} done · ${byClusterId.size}/${blogsTotal} plans`,
          byClusterId.size,
        );
      }
      fillMissingClusterBriefs(topic.clusters, byClusterId, rowById);
      return topic;
    },
    signal,
    (topicsDone, total, topic) => {
      onProgress?.({
        topicsCompleted: topicsDone,
        topicsTotal: total,
        currentTopicLabel: topic.tagLabel,
        blogsCompleted: byClusterId.size,
        blogsTotal,
        topicsInFlight: Math.max(
          0,
          Math.min(SITEMAP_OPTIMIZER_GRID_BLOG_BRIEF_SECTION_CONCURRENCY, total - topicsDone),
        ),
        microStep: `Topic done · ${topic.tagLabel} · ${byClusterId.size}/${blogsTotal} plans`,
        mergeBatchCompleted,
        mergeBatchTotal,
      });
    },
  );

  fillMissingClusterBriefs(targets, byClusterId, rowById);

  onProgress?.({
    topicsCompleted: topicsTotal,
    topicsTotal,
    blogsCompleted: byClusterId.size,
    blogsTotal,
    topicsInFlight: 0,
    microStep: `All ${blogsTotal} content plans ready`,
    mergeBatchCompleted: mergeBatchTotal,
    mergeBatchTotal,
  });

  return targets.map((c) => {
    let brief =
      byClusterId.get(c.clusterId) ?? buildDeterministicGridBrief(c, rowById, undefined, blogPolicy);
    if (!brief) {
      fillMissingClusterBriefs([c], byClusterId, rowById);
      brief =
        byClusterId.get(c.clusterId) ?? buildDeterministicGridBrief(c, rowById, undefined, blogPolicy);
    }
    if (!brief) {
      return {
        clusterId: c.clusterId,
        recommendedTitle: (c.label || "New article").slice(0, 60),
        recommendedPrimaryKeyword: "guide",
        recommendedMeta: "Consolidated guide for related search URLs.",
        combinedOutline: ["Overview", "Key points"],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "medium" as const,
        confidence: "medium" as const,
        rationale: "Deterministic grid brief (empty cluster fallback).",
      };
    }
    return brief;
  });
}
