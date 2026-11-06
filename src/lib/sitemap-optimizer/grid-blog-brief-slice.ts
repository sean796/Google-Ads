import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { SITEMAP_OPTIMIZER_GRID_URL_TAG_MAX_TOKENS } from "@/lib/sitemap-optimizer/constants";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { parseGridBlogBriefBatchJson } from "@/lib/sitemap-optimizer/grid-blog-brief-parse";
import { fillMissingClusterBriefs } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";
import { briefSystemPrompt } from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-prompts";
import {
  buildClusterPayload,
  resolvedMembers,
  type TopicTagSection,
} from "@/lib/sitemap-optimizer/grid-blog-brief-by-topic-helpers";
import { finalizeBrief } from "@/lib/sitemap-optimizer/grid-blog-brief-finalize";

export async function briefOneTopicSlice(
  section: Pick<TopicTagSection, "topicTag" | "tagLabel">,
  clusters: readonly SitemapOptimizerCluster[],
  rowById: Map<string, SitemapOptimizerPostRow>,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  fixedDestinations?: boolean,
  blogDestination?: BlogDestinationPolicy | null,
): Promise<Map<string, SitemapOptimizerMergeRecommendation>> {
  const allowedIds = clusters.map((c) => c.clusterId);
  let siteOrigin = "";
  for (const cluster of clusters) {
    for (const row of resolvedMembers(cluster, rowById)) {
      try {
        siteOrigin = new URL(row.url.trim()).origin;
        break;
      } catch {
        /* skip */
      }
    }
    if (siteOrigin) break;
  }

  const user = JSON.stringify({
    task: "grid_blog_briefs_for_topic_section",
    topicTag: section.topicTag,
    tagLabel: section.tagLabel,
    siteOrigin,
    requiredBriefCount: clusters.length,
    allowedClusterIds: allowedIds,
    mandatoryTitleRules: [
      "If recommendedPrimaryKeyword contains 19xx or 20xx, recommendedTitle MUST contain that exact year.",
      "Do not drop years for 'historical overview' or similar phrasing when the keyword names a year.",
    ],
    clusters: clusters.map((c) => buildClusterPayload(c, rowById)),
    outputSchema: {
      briefs: [
        {
          clusterId: "string",
          recommendedTitle: "string",
          recommendedPrimaryKeyword: "string",
          recommendedMeta: "string",
          lockedDestinationUrl: "string",
          combinedOutline: ["H2 string"],
          whatToKeepFromEach: [{ url: "string", title: "string", bullets: ["string"] }],
          redirectOrCanonicalNote: "string",
          priority: "high|medium|low",
          confidence: "high|medium|low",
          rationale: "string",
        },
      ],
    },
  });

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: briefSystemPrompt(Boolean(fixedDestinations)),
    user,
    maxTokens: SITEMAP_OPTIMIZER_GRID_URL_TAG_MAX_TOKENS,
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal,
  });

  const parsed = parseGridBlogBriefBatchJson(content);
  const clusterById = new Map(clusters.map((c) => [c.clusterId, c]));
  const out = new Map<string, SitemapOptimizerMergeRecommendation>();

  for (const brief of parsed) {
    if (!brief.clusterId || !allowedIds.includes(brief.clusterId)) continue;
    const cluster = clusterById.get(brief.clusterId);
    if (!cluster) continue;
    const finalized = finalizeBrief(brief, cluster, rowById, blogDestination);
    if (finalized) out.set(brief.clusterId, finalized);
  }

  return out;
}

export async function briefTopicSliceWithFullCoverage(
  section: Pick<TopicTagSection, "topicTag" | "tagLabel">,
  clusters: readonly SitemapOptimizerCluster[],
  rowById: Map<string, SitemapOptimizerPostRow>,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  fixedDestinations?: boolean,
  blogDestination?: BlogDestinationPolicy | null,
): Promise<Map<string, SitemapOptimizerMergeRecommendation>> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const part = await briefOneTopicSlice(
    section,
    clusters,
    rowById,
    apiKey,
    model,
    signal,
    fixedDestinations,
    blogDestination,
  );
  const missing = clusters.filter((c) => !part.has(c.clusterId));

  if (missing.length === 0) return part;

  if (clusters.length <= 1) {
    fillMissingClusterBriefs(clusters, part, rowById);
    return part;
  }

  const mid = Math.ceil(clusters.length / 2);
  const left = await briefTopicSliceWithFullCoverage(
    section,
    clusters.slice(0, mid),
    rowById,
    apiKey,
    model,
    signal,
    fixedDestinations,
    blogDestination,
  );
  const right = await briefTopicSliceWithFullCoverage(
    section,
    clusters.slice(mid),
    rowById,
    apiKey,
    model,
    signal,
    fixedDestinations,
    blogDestination,
  );

  const merged = new Map(part);
  for (const [id, b] of left) merged.set(id, b);
  for (const [id, b] of right) merged.set(id, b);
  fillMissingClusterBriefs(clusters, merged, rowById);
  return merged;
}
