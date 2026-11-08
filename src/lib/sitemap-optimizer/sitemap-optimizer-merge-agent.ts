import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  stripHtmlToPlainText,
  truncatePlainText,
} from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { SITEMAP_OPTIMIZER_MERGE_CONTENT_MAX } from "@/lib/sitemap-optimizer/constants";
import { isMergeableCluster, resolvedMemberRows } from "@/lib/sitemap-optimizer/resolved-cluster-members";
import { parseMergeRecommendationJson } from "@/lib/sitemap-optimizer/sitemap-optimizer-parse";
import {
  ENTITY_MERGE_AGENT_PREAMBLE,
  entityMergeContextForMembers,
} from "@/lib/sitemap-optimizer/entity-merge-prompts";
import {
  MERGE_BRIEF_OUTPUT_RULES,
  TECHNICAL_SEO_STRATEGIST_ROLE,
} from "@/lib/sitemap-optimizer/seo-strategist-prompts";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

const MERGE_SYSTEM = `${TECHNICAL_SEO_STRATEGIST_ROLE}

Given 2 or more overlapping WordPress posts that truly cannibalize (same searcher need, same geo when local, same topic type), plan one definitive consolidated article.

The cluster was pre-checked for precision: do not broaden scope beyond what these specific members share. If members mix cities or topics, focus only on the intersection of intent. Use gscTopQueries and contentSnippet to justify keyword and outline choices.

${MERGE_BRIEF_OUTPUT_RULES}`;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
  onItemDone?: (completed: number, total: number) => void,
): Promise<R[]> {
  const n = items.length;
  const ret: R[] = new Array(n);
  let next = 0;
  let finished = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = next++;
      if (idx >= n) return;
      ret[idx] = await fn(items[idx]!);
      finished += 1;
      onItemDone?.(finished, n);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

function memberPayload(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
): Record<string, unknown>[] {
  return cluster.memberPostIds.map((id) => {
    const row = rowById.get(id);
    if (!row) return { postId: id, missing: true };
    const body =
      row.contentSnippet ||
      truncatePlainText(stripHtmlToPlainText(row.seoResearch ?? ""), SITEMAP_OPTIMIZER_MERGE_CONTENT_MAX);
    return {
      postId: id,
      url: row.url,
      title: row.title,
      keyword: row.keyword,
      meta: row.meta,
      collection: row.collection,
      gscTopQueries: row.gscQueries.slice(0, 12).map((q) => q.query),
      contentSnippet: body,
    };
  });
}

const MERGE_IMPORT_SYSTEM_APPEND = `

NEO Pulse redirect redirect import:
- lockedDestinationUrl is the final canonical URL for the new consolidated post. Do not suggest a different URL or slug.
- Align recommendedPrimaryKeyword and recommendedTitle with the destination URL slug when sensible.
- whatToKeepFromEach must include every member URL listed in the payload.`;

async function mergeOneCluster(
  cluster: SitemapOptimizerCluster,
  rowById: Map<string, SitemapOptimizerPostRow>,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  lockedDestinationUrl?: string,
  entityMode = false,
): Promise<SitemapOptimizerMergeRecommendation | null> {
  const members = resolvedMemberRows(cluster, rowById);
  const userPayload: Record<string, unknown> = {
    task: lockedDestinationUrl ? "recommend_merged_post_from_redirectcsv_import" : "recommend_merged_post",
    cluster: {
      clusterId: cluster.clusterId,
      label: cluster.label,
      intent: cluster.intent,
      rationale: cluster.rationale,
    },
    members: memberPayload(cluster, rowById),
    outputSchema: {
      clusterId: "string",
      recommendedTitle: "string",
      recommendedPrimaryKeyword: "string",
      recommendedMeta: "string",
      combinedOutline: ["H2 string"],
      whatToKeepFromEach: [{ url: "string", title: "string", bullets: ["string"] }],
      redirectOrCanonicalNote: "string",
      priority: "high|medium|low",
      confidence: "high|medium|low",
      rationale: "string",
    },
  };

  if (lockedDestinationUrl) {
    userPayload.lockedDestinationUrl = lockedDestinationUrl;
    userPayload.instructions =
      "Plan one consolidated article for the locked destination. Source posts are being merged and redirected; extract topics from their content only.";
  }

  const user = JSON.stringify(userPayload);

  const memberCount = cluster.memberPostIds.length;
  const maxTokens = memberCount > 3 ? 8000 : 5000;

  const entityContext = entityMode ? entityMergeContextForMembers(members) : "";
  const system = entityMode
    ? `${ENTITY_MERGE_AGENT_PREAMBLE}\n\n${MERGE_BRIEF_OUTPUT_RULES}`
    : lockedDestinationUrl
      ? MERGE_SYSTEM + MERGE_IMPORT_SYSTEM_APPEND
      : MERGE_SYSTEM;

  if (entityContext) {
    userPayload.entityContext = entityContext;
  }

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user,
    maxTokens,
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal,
  });

  const parsed = parseMergeRecommendationJson(content, cluster.clusterId);
  if (!parsed) return null;
  if (lockedDestinationUrl) {
    return { ...parsed, lockedDestinationUrl };
  }
  return parsed;
}

export async function runSitemapOptimizerMergeAgentForImport(
  clusters: SitemapOptimizerCluster[],
  rows: SitemapOptimizerPostRow[],
  lockedDestinationsByClusterId: Map<string, string>,
  apiKey: string,
  concurrency: number,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<SitemapOptimizerMergeRecommendation[]> {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const mergeable = clusters.filter((c) => isMergeableCluster(c, rowById));
  if (mergeable.length === 0) return [];

  const model = getResearchModel();

  const results = await mapWithConcurrency(
    mergeable,
    concurrency,
    (cluster) => {
      const locked = lockedDestinationsByClusterId.get(cluster.clusterId);
      return mergeOneCluster(cluster, rowById, apiKey, model, signal, locked);
    },
    signal,
    onProgress,
  );

  return results.filter((r): r is SitemapOptimizerMergeRecommendation => r != null);
}

export async function runSitemapOptimizerMergeAgent(
  clusters: SitemapOptimizerCluster[],
  rows: SitemapOptimizerPostRow[],
  apiKey: string,
  concurrency: number,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
  options?: { entityMode?: boolean },
): Promise<SitemapOptimizerMergeRecommendation[]> {
  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const mergeable = clusters.filter((c) => isMergeableCluster(c, rowById));
  if (mergeable.length === 0) return [];

  const model = getResearchModel();
  const entityMode = options?.entityMode ?? false;

  const results = await mapWithConcurrency(
    mergeable,
    concurrency,
    (cluster) => mergeOneCluster(cluster, rowById, apiKey, model, signal, undefined, entityMode),
    signal,
    onProgress,
  );

  return results.filter((r): r is SitemapOptimizerMergeRecommendation => r != null);
}
